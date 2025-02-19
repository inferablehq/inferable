import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend } from 'k6/metrics';

const runTime = new Trend('run_time', true);

export const options = {
  // K6 defaults
  // vus: 1,
  // iterations: 1,
  // expect all checks to pass
  thresholds: {
    checks: ['rate==1.0'],
  },
};

const API_SECRET = __ENV.INFERABLE_TEST_API_SECRET
const CLUSTER_ID = __ENV.INFERABLE_TEST_CLUSTER_ID
const WORKFLOW_NAME = "searchHaystack"
const BASE_URL = 'https://api.inferable.ai';

function generateULID() {
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  const timestamp = Date.now().toString(16).padStart(12, "0");
  const randomPart = Array.from({ length: 8 }, random).join("");
  return timestamp + randomPart;
}
export default function () {
  if (!API_SECRET || !CLUSTER_ID) {
    throw new Error('Missing required environment variables');
  }

  const executionId = generateULID();

  // Create a new run
  const postWorkflowResponse = http.post(`${BASE_URL}/clusters/${CLUSTER_ID}/workflows/${WORKFLOW_NAME}/executions`, JSON.stringify({
    executionId,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_SECRET}`
    }
  });

  check(postWorkflowResponse, {
    'workflow created': (r) => r.status === 201
  })

  const start = new Date().getTime();

  // Poll the workflow until complete or timeout
  let attempts = 0;
  const maxAttempts = 300;

  while (attempts < maxAttempts) {
    const getWorkflowTimelineResponse = http.get(`${BASE_URL}/clusters/${CLUSTER_ID}/workflows/${WORKFLOW_NAME}/executions/${executionId}/timeline`, {
      headers: {
        'Authorization': `Bearer ${API_SECRET}`
      }
    });

    const workflow = getWorkflowTimelineResponse.json();

    check(getWorkflowTimelineResponse, {
      'workflow request succeeded': (r) => r.status === 200
    });

    if (!workflow) {
      throw new Error("Workflow request failed");
    }

    if (workflow.execution.job.status === "success") {

      check(workflow.execution.job, {
        'workflow completed': (r) => r.status === 'success'
      });

      // parse JSON
      const result = JSON.parse(workflow.execution.job.result);

      check(result, {
        'found needle word': (r) => r.value.word === 'needle'
      });

      if (! "word" in result) {
        throw new Error('Missing required result field');
      }


      runTime.add(new Date().getTime() - start);

      break;
    }

    attempts++;
    sleep(1);
  }

  check(attempts, {
    'attempts < maxAttempts': (a) => a < maxAttempts
  });
}
