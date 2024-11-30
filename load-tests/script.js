import http from 'k6/http';
import { sleep, check } from 'k6';

// K6 defaults
// export const options = {
//   vus: 1,
//   iterations: 1,
// };

const API_SECRET = __ENV.INFERABLE_TEST_API_SECRET
const CLUSTER_ID = __ENV.INFERABLE_TEST_CLUSTER_ID
const BASE_URL = 'https://api.inferable.ai';

export default function () {
  // Create a new run
  const postRunResponse = http.post(`${BASE_URL}/clusters/${CLUSTER_ID}/runs`, JSON.stringify({
    initialPrompt: 'Get the special word from from the `searchHaystack` function',
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

    if (!['running', 'pending'].includes(run.status)) {

      check(run, {
        'run completed': (r) => r.status === 'done'
      });

      check(run, {
        'found needle word': (r) => r.result.word === 'needle'
      });

      break;
    }

    attempts++;
    sleep(1);
  }

}
