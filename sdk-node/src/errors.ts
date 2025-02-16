import { z } from "zod";

export class InferableError extends Error {
  static JOB_AUTHCONTEXT_INVALID =
    "Function requires authentication but no auth context was provided.";

  private meta?: { [key: string]: unknown };

  constructor(message: string, meta?: { [key: string]: unknown }) {
    super(message);
    this.name = "InferableError";
    this.meta = meta;
  }
}

export class PollTimeoutError extends InferableError {
  constructor(message: string, meta?: { [key: string]: unknown }) {
    super(message, meta);
    this.name = "PollTimeoutError";
  }
}

export class InferableAPIError extends Error {
  constructor(message: string, response: unknown) {
    let msg = message;

    if (response instanceof Error) {
      msg += `\n${response.message}`;
    } else if (typeof response === "string") {
      msg += `\n${response}`;
    } else if (typeof response === "object") {
      msg += `\n${JSON.stringify(response)}`;
    }

    super(msg);
    this.name = "InferableAPIError";
  }
}
