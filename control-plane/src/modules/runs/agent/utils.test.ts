import { estimateTokenCount } from "./utils";

describe("estimateTokenCount", () => {
  it("should return the correct count", async () => {
    const input = "Some random text";
    const result = await estimateTokenCount(input);
    expect(result).toEqual(3);
  });
});
