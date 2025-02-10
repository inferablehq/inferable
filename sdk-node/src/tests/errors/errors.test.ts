import assert from "assert";
import { client, TEST_CLUSTER_ID } from "../utils";
import { animalService } from "./animals";

describe("Errors", () => {
  const service = animalService();
  jest.retryTimes(2);
  beforeAll(async () => {
    await service.client.tools.listen();
  }, 10000);

  afterAll(async () => {
    await service.client.tools.unlisten();
  });

  it("should get the normal error", async () => {
    const result = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        tool: `${service.prefix}_getNormalAnimal`,
        input: {},
      },
    });

    expect(result.status).toBe(200);
    assert(result.status === 200);

    expect(result.body).toEqual(
      expect.objectContaining({
        status: "success",
        resultType: "rejection",
        result: expect.objectContaining({
          name: "Error",
          message: "This is a normal error",
        }),
      }),
    );
  });

  it("should get the custom error", async () => {
    const result = await client.createJob({
      query: {
        waitTime: 20,
      },
      params: {
        clusterId: TEST_CLUSTER_ID,
      },
      body: {
        tool: `${service.prefix}_getCustomAnimal`,
        input: {},
      },
    });

    expect(result.status).toBe(200);
    assert(result.status === 200);

    expect(result.body).toEqual(
      expect.objectContaining({
        status: "success",
        resultType: "rejection",
        result: expect.objectContaining({
          name: "AnimalError",
          message: "This is a custom error",
        }),
      }),
    );
  });
});
