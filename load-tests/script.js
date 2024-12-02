import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  // K6 defaults
  // vus: 1,
  // iterations: 1,
  thresholds: {
    // expect all checks to pass
    checks: ['rate>=1'],
  },
};

const API_SECRET = __ENV.INFERABLE_TEST_API_SECRET
const CLUSTER_ID = __ENV.INFERABLE_TEST_CLUSTER_ID
const BASE_URL = 'https://api.inferable.ai';

export default function () {
  if (!API_SECRET || !CLUSTER_ID) {
    throw new Error('Missing required environment variables');
  }

  // Create a new run
  const postRunResponse = http.post(`${BASE_URL}/clusters/${CLUSTER_ID}/runs`, JSON.stringify({
    initialPrompt: 'Get the special word from the `searchHaystack` function',
    resultSchema: {
      type: 'object',
      properties: {
        word: {
          type: 'string'
        }
      }
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_SECRET}`
    }
  });

  check(postRunResponse, {
    'run created': (r) => r.status === 201
  });

  const runId = postRunResponse.json('id');

  // Poll the run status until complete or timeout
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const getRunResponse = http.get(`${BASE_URL}/clusters/${CLUSTER_ID}/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${API_SECRET}`
      }
    });

    const run = getRunResponse.json();

    if (!['running', 'pending', 'paused'].includes(run.status)) {

      check(run, {
        'run completed': (r) => r.status === 'done'
      });

      if (! "word" in run.result) {
        throw new Error('Missing required result field');
      }

      check(run, {
        'found needle word': (r) => r.result.word === 'needle'
      });

      break;
    }

    attempts++;
    sleep(1);
  }

}
