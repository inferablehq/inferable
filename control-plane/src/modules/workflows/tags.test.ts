import { createOwner } from "../test/util";
import { getRunsByTag } from "./tags";
import { createRun } from "./workflows";

describe("getWorkflowsByMetadata", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;

  beforeAll(async () => {
    owner = await createOwner();
  });

  it("should return workflows with matching metadata", async () => {
    const workflow = await createRun({
      clusterId: owner.clusterId,
      tags: {
        foo: "bar",
      },
    });

    await createRun({
      clusterId: owner.clusterId,
      tags: {
        foo: "baz",
      },
    });

    const result = await getRunsByTag({
      clusterId: owner.clusterId,
      key: "foo",
      value: "bar",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toEqual(workflow.id);
  });
});
