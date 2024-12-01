import { ulid } from "ulid";
import { createOwner } from "./test/util";
import {
  getRunConfig,
  mergeRunConfigOptions,
  upsertRunConfig,
} from "./prompt-templates";

describe("prompt-templates", () => {
  describe("upsertPromptTemplate", () => {
    it("should create a new prompt template", async () => {
      const owner = await createOwner();
      const id = ulid();

      const template = await upsertRunConfig({
        id,
        clusterId: owner.clusterId,
        name: "test template",
        initialPrompt: "test prompt",
      });

      expect(template).toEqual(
        expect.objectContaining({
          id,
          clusterId: owner.clusterId,
          name: "test template",
          initialPrompt: "test prompt",
          attachedFunctions: [],
          resultSchema: null,
        }),
      );
    });

    it("should update changed fields", async () => {
      const owner = await createOwner();
      const id = ulid();

      await upsertRunConfig({
        id,
        clusterId: owner.clusterId,
        name: "test template",
        initialPrompt: "test prompt",
        attachedFunctions: ["test_fn"],
        resultSchema: { foo: "bar" },
      });

      await upsertRunConfig({
        id,
        clusterId: owner.clusterId,
        name: "new name",
        initialPrompt: "new prompt",
        attachedFunctions: ["new_fn"],
        resultSchema: { foo: "baz" },
      });

      const updated = await getRunConfig({
        id,
        clusterId: owner.clusterId,
      });

      expect(updated).toEqual(
        expect.objectContaining({
          id,
          clusterId: owner.clusterId,
          name: "new name",
          initialPrompt: "new prompt",
          attachedFunctions: ["new_fn"],
          resultSchema: { foo: "baz" },
        }),
      );
    });

    it("should not allow creation without name", async () => {
      const owner = await createOwner();
      const id = ulid();

      await expect(
        upsertRunConfig({
          id,
          clusterId: owner.clusterId,
        }),
      ).rejects.toThrow();

      await expect(
        upsertRunConfig({
          id,
          clusterId: owner.clusterId,
          initialPrompt: "test prompt",
        }),
      ).rejects.toThrow();
    });
  });

  describe("mergeRunConfigOptions", () => {
    it("should merge options with run config", () => {
      const options = {
        interactive: true,
        reasoningTraces: true,
        callSummarization: true,
        modelIdentifier: "claude-3-5-sonnet" as const,
      };

      const runConfig = {
        id: "test-id",
        name: "test-template",
        initialPrompt: "Hello John",
        systemPrompt: "Be helpful",
        attachedFunctions: ["test_fn"],
      } as any;

      const result = mergeRunConfigOptions(options, runConfig);

      expect(result.error).toBeNull();
      expect(result.options).toEqual({
        initialPrompt: "Hello John",
        systemPrompt: "Be helpful",
        attachedFunctions: ["test_fn"],
        interactive: true,
        reasoningTraces: true,
        callSummarization: true,
        modelIdentifier: "claude-3-5-sonnet" as const,
        messageMetadata: {
          displayable: {
            templateId: "test-id",
            templateName: "test-template",
          },
        },
      });
    });

    it("should overwrite options with run config", () => {
      const options = {
        interactive: true,
        reasoningTraces: true,
        callSummarization: true,
        initialPrompt: "Hello Fred",
        systemPrompt: "Be unhelpful",
        attachedFunctions: ["real_fn"],
        modelIdentifier: "claude-3-5-sonnet" as const,
      };

      const runConfig = {
        id: "test-id",
        name: "test-template",
        initialPrompt: "Hello John",
        systemPrompt: "Be helpful",
        attachedFunctions: ["test_fn"],
      } as any;

      const result = mergeRunConfigOptions(options, runConfig);

      expect(result.error).toBeNull();
      expect(result.options).toEqual({
        initialPrompt: "Hello John",
        systemPrompt: "Be helpful",
        attachedFunctions: ["test_fn"],
        interactive: true,
        reasoningTraces: true,
        callSummarization: true,
        modelIdentifier: "claude-3-5-sonnet" as const,
        messageMetadata: {
          displayable: {
            templateId: "test-id",
            templateName: "test-template",
          },
        },
      });
    });

    it("should validate input against inputSchema", () => {
      const options = {
        input: {
          foo: "bar",
        },
      };

      const runConfig = {
        id: "test-id",
        name: "test-template",
        inputSchema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
          },
        },
      } as any;

      const result = mergeRunConfigOptions(options, runConfig);

      expect(result.error).toEqual({
        status: 400,
        body: {
          message: "Could not validate run input",
          errors: expect.any(Array),
        },
      });
    });
  });
});
