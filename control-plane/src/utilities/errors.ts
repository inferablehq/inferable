import { RateLimitError, InternalServerError } from "@anthropic-ai/sdk";

export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

const retryableErrors = [RetryableError, RateLimitError, InternalServerError];
const retryableErrorMessages = [
  // DB Connection Errors
  "connection terminated due to connection timeout",
  "timeout exceeded when trying to connect",
  "connection terminated unexpectedly",
  // DB Connection Pool Exhaustion
  "remaining connection slots are reserved for roles with the SUPERUSER attribute",
  "too many clients already",
  // Bedrock Errors
  "503 bedrock is unable to process your request",
  "429 too many requests",
];

export const isRetryableError = (error: unknown) => {
  if (
    error instanceof Error &&
    retryableErrorMessages.find(message => error.message.toLowerCase().includes(message))
  ) {
    return true;
  }

  if (error instanceof Error && retryableErrors.find(type => error instanceof type)) {
    return true;
  }

  return false;
};

export class DocumentedError extends Error {
  docsLink?: string;

  constructor(message: string, docsLink?: string) {
    super(message);
    this.name = "DocumentedError";
    this.docsLink = docsLink;
  }
}

export class AuthenticationError extends DocumentedError {
  statusCode = 401;

  constructor(message: string, docsLink: string = "https://docs.inferable.ai/pages/auth") {
    super(message, docsLink);
    this.name = "AuthenticationError";
  }
}

export class NotFoundError extends DocumentedError {
  statusCode: number = 404;

  constructor(message: string, docsLink?: string) {
    super(message, docsLink);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends DocumentedError {
  statusCode: number = 400;

  constructor(message: string, docsLink?: string) {
    super(message, docsLink);
    this.name = "BadRequestError";
  }
}

export class PaymentRequiredError extends DocumentedError {
  statusCode: number = 402;

  constructor(message: string, docsLink?: string) {
    super(message, docsLink);
    this.name = "PaymentRequiredError";
  }
}

export class JobPollTimeoutError extends DocumentedError {
  statusCode: number = 408;

  constructor(message: string, docsLink?: string) {
    super(message, docsLink);
    this.name = "JobRequestTimeoutError";
  }
}

export class InvalidServiceRegistrationError extends DocumentedError {
  statusCode = 400;

  constructor(
    message: string,
    docsLink: string = "https://docs.inferable.ai/pages/functions#options"
  ) {
    super(message, docsLink);
    this.name = "InvalidServiceRegistrationError";
  }
}

export class InvalidJobArgumentsError extends DocumentedError {
  statusCode = 400;

  constructor(
    message: string,
    docsLink: string = "https://docs.inferable.ai/pages/functions#options"
  ) {
    super(message, docsLink);
    this.name = "InvalidArgumentsError";
  }
}

export class AgentError extends DocumentedError {
  constructor(message: string, docsLink?: string) {
    super(message, docsLink);
    this.name = "AgentError";
  }
}

export class RunBusyError extends DocumentedError {
  statusCode = 409;

  constructor(
    message: string = "Run is still processing, please try again later.",
    docsLink: string = "https://docs.inferable.ai/pages/runs#lifecycle"
  ) {
    super(message, docsLink);
    this.name = "RunBusyError";
  }
}

export class TooManyRequestsError extends DocumentedError {
  statusCode = 429;

  constructor(message: string, docsLink?: string) {
    super(message, docsLink);
    this.name = "TooManyRequestsError";
  }
}
