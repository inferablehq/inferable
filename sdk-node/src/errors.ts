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
    const genericResponse = z
      .object({
        status: z.number(),
        body: z
          .object({
            error: z
              .object({
                message: z.string(),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .safeParse(response);

    const zodErrorResponse = z
      .object({
        status: z.number(),
        body: z.object({
          bodyErrors: z.object({
            issues: z.array(
              z.object({
                validation: z.string().optional(),
                code: z.string(),
                message: z.string(),
                path: z.array(z.string()),
              }),
            ),
            name: z.literal("ZodError"),
          }),
        }),
      })
      .safeParse(response);

    let msg = message;

    if (genericResponse.success) {
      msg = genericResponse.data.body.error.message;
    } else if (zodErrorResponse.success) {
      msg = Object.entries(zodErrorResponse.data)
        .filter(([_, value]) => value !== null)
        .map(([_, value]) => {
          if (
            typeof value === "object" &&
            value !== null &&
            "bodyErrors" in value
          ) {
            return value.bodyErrors.issues
              ?.map(
                (issue: { path: string[]; message: string }) =>
                  `Path=${issue.path.join(".")}, Message=${issue.message}`,
              )
              .flat()
              .filter(Boolean)
              .join(", ");
          }
          return "";
        })
        .flat()
        .filter(Boolean)
        .join(", ");
    }

    super(msg);
    this.name = "InferableAPIError";
  }
}
