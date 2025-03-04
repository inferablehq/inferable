import { isRetryableError, RetryableError } from "./errors";
import { RateLimitError } from "@anthropic-ai/sdk";

describe("isRetryableError", () => {
  it("should return true for retryable errors", async () => {
    expect(isRetryableError(new Error())).toBe(false);

    expect(isRetryableError(new RateLimitError(429, new Error(), "", {}))).toBe(
      true,
    );
    expect(isRetryableError(new RetryableError(""))).toBe(true);

    expect(
      isRetryableError(
        new Error("429 Too many requests, please wait before trying again."),
      ),
    ).toBe(true);
  });
});
