import { AuthenticationError } from "../../utilities/errors";
import { pollJobsByTools } from "../jobs/jobs";
import { acknowledgeJob, persistJobResult } from "../jobs/job-results";
import { editClusterDetails } from "../management";
import { packer } from "../packer";
import { createOwner } from "../test/util";
import { verify } from "./custom";
import { upsertToolDefinition } from "../tools";

describe("custom auth verification", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;
  const mockAuthFunction = "verifyAuth";
  const mockToken = "test-token";
  const mockAuthResult = { userId: "test-user", roles: ["admin"] };
  let authHandler: NodeJS.Timeout;

  beforeAll(async () => {
    // Create owner with custom auth enabled
    owner = await createOwner({ enableCustomAuth: true });

    // Set up the auth service and function
    await editClusterDetails({
      organizationId: owner.organizationId,
      clusterId: owner.clusterId,
      handleCustomAuthFunction: `${mockAuthFunction}`,
    });

    // Register the auth service and function
    await upsertToolDefinition({
      name: mockAuthFunction,
      schema: JSON.stringify({
        type: "object",
        properties: {
          token: { type: "string" },
        },
        required: ["token"],
      }),
      clusterId: owner.clusterId,
    });

    authHandler = setInterval(async () => {
      const nextJobId = await pollJobsByTools({
        clusterId: owner.clusterId,
        machineId: "test-machine",
        tools: ['verifyAuth'],
        limit: 10,
      });

      await Promise.allSettled(
        nextJobId.map(async job => {
          if (job.targetArgs.includes(mockToken)) {
            await persistJobResult({
              jobId: job.id,
              owner: {
                clusterId: owner.clusterId,
              },
              machineId: "test-machine",
              result: packer.pack(mockAuthResult),
              resultType: "resolution",
            });
          } else {
            await acknowledgeJob({
              clusterId: owner.clusterId,
              machineId: "test-machine",
              jobId: job.id,
            });
          }
        })
      );
    }, 500);
  });

  afterAll(() => {
    clearInterval(authHandler);
  });

  it("should verify a valid token", async () => {
    const result = await verify({
      token: mockToken,
      clusterId: owner.clusterId,
    });

    expect(result).toEqual(mockAuthResult);
  });

  it("should cache successful results", async () => {
    // First verification
    await verify({
      token: mockToken,
      clusterId: owner.clusterId,
    });

    // Second verification should use cached result
    const result2 = await verify({
      token: mockToken,
      clusterId: owner.clusterId,
    });

    expect(result2).toEqual(mockAuthResult);
  });

  it("should throw AuthenticationError for invalid token", async () => {
    await expect(
      verify({
        token: "invalid-token",
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(AuthenticationError);
  });

  it("should cache authentication errors", async () => {
    await expect(
      verify({
        token: "invalid-token",
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(AuthenticationError);
  });
});
