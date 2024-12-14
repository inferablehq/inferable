import { createOwner } from "../test/util";
import { getRunsByMetadata } from "./metadata";
import { createRun } from "./workflows";

describe("getWorkflowsByMetadata", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;

  beforeAll(async () => {
    owner = await createOwner();
  });

  it("should return workflows with matching metadata", async () => {
    const workflow = await createRun({
      clusterId: owner.clusterId,
      metadata: {
        foo: "bar",
      },
    });

    await createRun({
      clusterId: owner.clusterId,
      metadata: {
        foo: "baz",
      },
    });

    const result = await getRunsByMetadata({
      clusterId: owner.clusterId,
      key: "foo",
      value: "bar",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toEqual(workflow.id);
  });
});
