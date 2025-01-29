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
