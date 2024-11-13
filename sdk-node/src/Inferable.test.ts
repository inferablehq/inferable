import assert from "assert";
import { z } from "zod";
import { Inferable } from "./Inferable";
import {
  TEST_CLUSTER_ID,
  TEST_API_SECRET,
  client,
  inferableInstance,
} from "./tests/utils";
import { setupServer } from "msw/node";
import { http, HttpResponse, passthrough } from "msw";
import { statusChangeSchema } from "./types";

const testService = () => {
  const inferable = inferableInstance();

  const service = inferable.service({
    name: `echoService${Math.random().toString(36).substring(2, 15)}`,
  });

  service.register({
    name: "echo",
    func: async (input: { text: string }) => {
      return { echo: input.text };
    },
    schema: {
      input: z.object({
        text: z.string(),
      }),
    },
  });

  service.register({
    name: "error",
    func: async (_input) => {
      throw new Error("This is an error");
    },
    schema: {
      input: z.object({
        text: z.string(),
      }),
    },
  });

  return service;
};

describe("Inferable", () => {
  const env = process.env;
  beforeEach(() => {
    delete process.env.INFERABLE_API_SECRET;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("should initialize without optional args", () => {
    expect(() => new Inferable({ apiSecret: TEST_API_SECRET })).not.toThrow();
  });

  it("should initialize with API secret in environment", () => {
    process.env.INFERABLE_API_SECRET = TEST_API_SECRET;
    expect(() => new Inferable()).not.toThrow();
  });

  it("should throw if no API secret is provided", () => {
    expect(() => new Inferable()).toThrow();
  });

  it("should throw if invalid API secret is provided", () => {
    expect(() => new Inferable({ apiSecret: "invalid" })).toThrow();
  });

  it("should register a function", async () => {
    const d = inferableInstance();

    const echo = async (param: { foo: string }) => {
      return param.foo;
    };

    const service = d.service({ name: "test" });

    service.register({
      func: echo,
      name: "echo",
      schema: {
        input: z.object({
          foo: z.string(),
        }),
      },
      description: "echoes the input",
    });

    expect(d.registeredFunctions).toEqual(["echo"]);
  });

  it("should list active and inactive services correctly", async () => {
    const d = inferableInstance();

    const service = d.service({ name: "test" });

    const echo = async (param: { foo: string }) => {
      return param.foo;
    };

    service.register({
      func: echo,
      name: "echo",
      schema: {
        input: z.object({
          foo: z.string(),
        }),
      },
      description: "echoes the input",
    });

    expect(d.activeServices).toEqual([]);
    expect(d.inactiveServices).toEqual([]);

    await service.start();

    expect(d.activeServices).toEqual(["test"]);
    expect(d.inactiveServices).toEqual([]);

    await service.stop();

    expect(d.activeServices).toEqual([]);
    expect(d.inactiveServices).toEqual(["test"]);
  });
});

describe("Functions", () => {
  it("should handle successful function calls", async () => {
    const service = testService();

    await service.start();

    const results = await Promise.all(
      Array.from({ length: 10 }).map(async (_, i) => {
        return client.createCall({
          query: {
            waitTime: 20,
          },
          params: {
            clusterId: TEST_CLUSTER_ID,
          },
          body: {
            function: "echo",
            service: service.definition.name,
            input: { text: i.toString() },
          },
        });
      }),
    );

    results.forEach((result) => {
      expect(result.status).toBe(200);
      assert(result.status === 200);

      expect(result.body).toEqual(
        expect.objectContaining({
          status: "success",
          resultType: "resolution",
          result: {
            echo: expect.any(String),
          },
        }),
      );
    });

    await service.stop();
  });

  it("should recover from transient polling errors", async () => {
    // Fail the first 20 polls
    let count = 0;
    const server = setupServer(
      http.all("*/calls", async () => {
        if (count < 1) {
          count += 1;
          return new HttpResponse(null, { status: 500 });
        }
        return passthrough();
      }),
      http.all("*", async () => {
        return passthrough();
      }),
    );
    server.listen();

    const service = testService();
    await service.start();

    const result = await client.createCall({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        function: "echo",
        service: service.definition.name,
        input: { text: "foo" },
      },
    });

    expect(result.status).toEqual(200);
    assert(result.status === 200);
    expect(result.body.result).toEqual({ echo: "foo" });

    server.close();
  });

  it("should fail if machine registeration fails", async () => {
    const server = setupServer(
      http.all("*/machines", async () => {
        return new HttpResponse(null, { status: 500 });
      }),
      http.all("*", async () => {
        return passthrough();
      }),
    );
    server.listen();

    const service = testService();

    await expect(service.start).rejects.toThrow();

    server.close();
  });
});

// This should match the example in the readme
describe("Inferable SDK End to End Test", () => {
  jest.retryTimes(3);
  it("should trigger a run, call a function, and call a status change function", async () => {
    const client = inferableInstance();

    let didCallSayHello = false;
    let didCallOnStatusChange = false;

    // Register a simple function (using the 'default' service)
    const sayHello = client.default.register({
      name: "sayHello",
      func: async ({ to }: { to: string }) => {
        didCallSayHello = true;
        return `Hello, ${to}!`;
      },
      schema: {
        input: z.object({
          to: z.string(),
        }),
      },
    });

    const onStatusChange = client.default.register({
      name: "onStatusChangeFn",
      schema: statusChangeSchema,
      func: (_input) => {
        didCallOnStatusChange = true;
      },
    });

    try {
      await client.default.start();

      const run = await client.run({
        initialPrompt: "Say hello to John",
        // Optional: Explicitly attach the `sayHello` function (All functions attached by default)
        attachedFunctions: [sayHello],
        // Optional: Define a schema for the result to conform to
        resultSchema: z.object({
          didSayHello: z.boolean(),
        }),
        // Optional: Subscribe an Inferable function to receive notifications when the run status changes
        onStatusChange: { function: onStatusChange },
      });

      const result = await run.poll();

      await new Promise((resolve) => setTimeout(resolve, 5000));

      expect(result).not.toBeNull();
      expect(didCallSayHello).toBe(true);
      expect(didCallOnStatusChange).toBe(true);
    } finally {
      await client.default.stop();
    }
  });

  describe("api", () => {
    it("should be able to call the api directly", async () => {
      const client = inferableInstance();

      const result = await client.api.createStructuredOutput<{
        capital: string;
      }>({
        prompt: "What is the capital of France?",
        modelId: "claude-3-5-sonnet",
        resultSchema: {
          type: "object",
          properties: {
            capital: { type: "string" },
          },
        },
      });

      expect(result).toMatchObject({
        success: true,
        data: {
          capital: "Paris",
        },
      });
    });
  });
});
