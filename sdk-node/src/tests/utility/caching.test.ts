import assert from "assert";
import { TEST_CLUSTER_ID, client } from "../utils";
import { productService } from "./product";

describe("Caching", () => {
  const service = productService();

  beforeAll(async () => {
    await service.client.tools.listen();
  }, 10000);

  afterAll(async () => {
    await service.client.tools.unlisten();
  });

  it("should get the cached results when possible", async () => {
    const productId = Math.random().toString();

    const result1 = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        service: "v2",
        function: `${service.prefix}_getProduct10sCache`,
        input: { id: productId, random: "foo" },
      },
    });

    const result2 = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        service: "v2",
        function: `${service.prefix}_getProduct10sCache`,
        input: { id: productId, random: "foo" },
      },
    });

    expect(result1.status).toBe(200);
    assert(result1.status === 200);

    expect(result2.status).toBe(200);
    assert(result2.status === 200);

    expect(result1.body).toEqual(
      expect.objectContaining({
        status: "success",
        resultType: "resolution",
        result: result2.body.result,
      }),
    );
  });

  it("should respect cache ttl", async () => {
    const productId = Math.random().toString();

    const result1 = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        service: "v2",
        function: `${service.prefix}_getProduct1sCache`,
        input: { id: productId, random: "foo" },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000)); // wait for cache to expire

    const result2 = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        service: "v2",
        function: `${service.prefix}_getProduct1sCache`,
        input: { id: productId, random: "bar" },
      },
    });

    expect(result1.status).toBe(200);
    assert(result1.status === 200);

    expect(result2.status).toBe(200);
    assert(result2.status === 200);

    expect(result1.body).toEqual(
      expect.objectContaining({
        status: "success",
        resultType: "resolution",
      }),
    );

    expect(result2.body).toEqual(
      expect.objectContaining({
        status: "success",
        resultType: "resolution",
      }),
    );

    expect(result1.body.result).not.toEqual(result2.body.result);
  });
});
