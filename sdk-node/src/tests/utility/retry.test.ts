import assert from "assert";
import { TEST_CLUSTER_ID, client } from "../utils";
import { productService } from "./product";

describe("retrying", () => {
  const service = productService();

  beforeAll(async () => {
    await service.client.tools.listen();
  });

  afterAll(async () => {
    await service.client.tools.unlisten();
  });

  // this test is wrong. in certain cases, the function will be completed
  // before the self-heal kicks in, persisting the result. in those cases,
  // function will be marked as completed and the retry will not happen.
  it.skip("should not retry a function when attempts is 1", async () => {
    const productId = Math.random().toString();

    const result = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        tool: `${service.prefix}_failingFunction`,
        input: { id: productId },
      },
    });

    expect(result.status).toBe(200);
    assert(result.status === 200);

    expect(result.body).toEqual(
      expect.objectContaining({
        status: "failure",
      }),
    );
  });

  it("should be able to retry a function", async () => {
    const productId = Math.random().toString();

    const result = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        tool: `${service.prefix}_succeedsOnSecondAttempt`,
        input: { id: productId },
      },
    });

    expect(result.status).toBe(200);
    assert(result.status === 200);

    expect(result.body).toEqual(
      expect.objectContaining({
        status: "success",
        resultType: "resolution",
      }),
    );
  }, 30_000);
});
