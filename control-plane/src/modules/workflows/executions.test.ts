import { z } from "zod";
import { createWorkflowExecution } from "./executions";
import { createOwner } from "../test/util";
import { upsertServiceDefinition } from "../service-definitions";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getJob } from "../jobs/jobs";

describe("createWorkflowExecution", () => {
  it("should create a workflow execution job", async () => {
    const owner = await createOwner();
    const workflowName = "testWorkflow";
    const version = "1";

    // Register a workflow service
    await upsertServiceDefinition({
      service: `workflows-${workflowName}-${version}`,
      definition: {
        name: workflowName,
        functions: [
          {
            name: "handler",
            schema: JSON.stringify(
              zodToJsonSchema(
                z.object({
                  executionId: z.string(),
                })
              )
            ),
          },
        ],
      },
      owner,
    });

    const executionId = "test-execution-id";
    const result = await createWorkflowExecution(owner.clusterId, workflowName, {
      executionId,
    });

    expect(result.jobId).toBeDefined();

    // Verify the job was created with correct parameters
    const job = await getJob({ jobId: result.jobId, clusterId: owner.clusterId });
    expect(job).toBeDefined();
    expect(job?.service).toBe(`workflows-${workflowName}-${version}`);
    expect(job?.targetFn).toBe("handler");
  });

  it("should throw error if no workflow registration exists", async () => {
    const owner = await createOwner();
    const workflowName = "nonexistentWorkflow";

    await expect(
      createWorkflowExecution(owner.clusterId, workflowName, {
        executionId: "test-execution-id",
      })
    ).rejects.toThrow(`No workflow registration for ${workflowName}`);
  });

  it("should throw error if input is invalid", async () => {
    const owner = await createOwner();
    const workflowName = "testWorkflow";

    await expect(
      createWorkflowExecution(owner.clusterId, workflowName, {
        invalidField: "test",
      })
    ).rejects.toThrow("Invalid input");
  });

  it("should use latest version when multiple versions exist", async () => {
    const owner = await createOwner();
    const workflowName = "testWorkflow";

    // Register version 1
    await upsertServiceDefinition({
      service: `workflows-${workflowName}-1`,
      definition: {
        name: workflowName,
        functions: [
          {
            name: "handler",
            schema: JSON.stringify(
              zodToJsonSchema(
                z.object({
                  executionId: z.string(),
                })
              )
            ),
          },
        ],
      },
      owner,
    });

    // Register version 2
    await upsertServiceDefinition({
      service: `workflows-${workflowName}-2`,
      definition: {
        name: workflowName,
        functions: [
          {
            name: "handler",
            schema: JSON.stringify(
              zodToJsonSchema(
                z.object({
                  executionId: z.string(),
                })
              )
            ),
          },
        ],
      },
      owner,
    });

    const executionId = "test-execution-id";
    const result = await createWorkflowExecution(owner.clusterId, workflowName, {
      executionId,
    });

    expect(result.jobId).toBeDefined();

    // Verify the job was created with version 2
    const job = await getJob({ jobId: result.jobId, clusterId: owner.clusterId });
    expect(job).toBeDefined();
    expect(job?.service).toBe(`workflows-${workflowName}-2`);
  });
});
