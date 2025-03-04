import http from "k6/http";
import { sleep, check } from "k6";
import { Trend } from "k6/metrics";

const runTime = new Trend("run_time", true);

export const options = {
  // K6 defaults
  // vus: 1,
  // iterations: 1,
  // expect all checks to pass
  thresholds: {
    checks: ["rate==1.0"],
  },
};

const API_SECRET = __ENV.INFERABLE_TEST_API_SECRET;
const CLUSTER_ID = __ENV.INFERABLE_TEST_CLUSTER_ID;
const BASE_URL = "https://api.inferable.ai";

export default function () {
  if (!API_SECRET || !CLUSTER_ID) {
    throw new Error("Missing required environment variables");
  }

  // Create a new run
  const postRunResponse = http.post(
    `${BASE_URL}/clusters/${CLUSTER_ID}/runs`,
    JSON.stringify({
      name: "Load Test",
      initialPrompt: "Get the special word from the `searchHaystack` function",
      reasoningTraces: false,
      tools: ["searchHaystack"],
      resultSchema: {
        type: "object",
        properties: {
          word: {
            type: "string",
          },
        },
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SECRET}`,
      },
    },
  );

  check(postRunResponse, {
    "run created": (r) => r.status === 201,
  });

  const runId = postRunResponse.json("id");

  const start = new Date().getTime();

  // Poll the run status until complete or timeout
  let attempts = 0;
  const maxAttempts = 300;

  while (attempts < maxAttempts) {
    const getRunResponse = http.get(
      `${BASE_URL}/clusters/${CLUSTER_ID}/runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${API_SECRET}`,
        },
      },
    );

    const run = getRunResponse.json();

    check(getRunResponse, {
      "run request succeeded": (r) => r.status === 200,
    });

    if (!run) {
      throw new Error("Run request failed");
    }

    if (!["running", "pending", "paused"].includes(run.status)) {
      check(run, {
        "run completed": (r) => r.status === "done",
      });

      if ((!"word") in run.result) {
        throw new Error("Missing required result field");
      }

      check(run, {
        "found needle word": (r) => r.result.word === "needle",
      });

      runTime.add(new Date().getTime() - start);

      break;
    }

    attempts++;
    sleep(1);
  }

  check(attempts, {
    "attempts < maxAttempts": (a) => a < maxAttempts,
  });
}
