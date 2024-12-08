import { buildModel } from ".";
import { RetryableError } from "../../utilities/errors";
import { getRouting } from "./routing";

const mockCreate = jest.fn(() => ({
  usage: {
    input_tokens: 0,
    output_tokens: 0,
  },
}));

jest.mock("./routing", () => ({
  getRouting: jest.fn(() => ({
    buildClient: jest.fn(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  })),
  isChatIdentifier: jest.fn(() => true),
  isEmbeddingIdentifier: jest.fn(() => false),
}));

describe("buildModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("call", () => {
    it("should retry with RetryableError", async () => {
      mockCreate.mockImplementationOnce(() => {
        throw new RetryableError("");
      });

      const model = buildModel({
        identifier: "claude-3-haiku",
      });

      await model.call({
        messages: [],
      });

      expect(getRouting).toHaveBeenCalledTimes(2);

      expect(getRouting).toHaveBeenCalledWith({
        index: 0,
        identifier: "claude-3-haiku",
      });

      expect(getRouting).toHaveBeenCalledWith({
        index: 1,
        identifier: "claude-3-haiku",
      });
    });


    it("should not retry other errors", async () => {
      const error = new Error("");
      mockCreate.mockImplementationOnce(() => {
        throw error;
      });

      const model = buildModel({
        identifier: "claude-3-haiku",
      });

      await expect(
        async () =>
          await model.call({
            messages: [],
          }),
      ).rejects.toThrow(error);

      expect(getRouting).toHaveBeenCalledTimes(1);

      expect(getRouting).toHaveBeenCalledWith({
        index: 0,
        identifier: "claude-3-haiku",
      });
    });

    it.skip("should throw after exhausting retries", async () => {
      mockCreate.mockImplementation(() => {
        throw new RetryableError("");
      });

      const model = buildModel({
        identifier: "claude-3-haiku",
      });

      await expect(
        () => model.call({
          messages: [],
        })
      ).rejects.toThrow(RetryableError);

      expect(getRouting).toHaveBeenCalledTimes(6);

      expect(getRouting).toHaveBeenCalledWith({
        index: 0,
        identifier: "claude-3-haiku",
      });

      expect(getRouting).toHaveBeenCalledWith({
        index: 1,
        identifier: "claude-3-haiku",
      });

      expect(getRouting).toHaveBeenCalledWith({
        index: 2,
        identifier: "claude-3-haiku",
      });

      expect(getRouting).toHaveBeenCalledWith({
        index: 3,
        identifier: "claude-3-haiku",
      });

      expect(getRouting).toHaveBeenCalledWith({
        index: 4,
        identifier: "claude-3-haiku",
      });
    }, 60_000);
  });
});
