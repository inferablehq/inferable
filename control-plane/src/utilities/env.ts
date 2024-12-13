// separating this and importing it allows
// tsx to run this before the rest of the app
// for dev purposes
import { z } from "zod";

export const truthy = z
  .enum(["0", "1", "true", "false"])
  .catch("false")
  .transform((value) => value == "true" || value == "1");

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["test", "development", "production"])
      .default("development")
      .transform((value) => {
        if (process.env.CI) {
          return "test";
        }
        return value;
      }),
    ENVIRONMENT: z.enum(["dev", "prod"]).default("dev"),

    VERSION: z.string().default("unknown"),
    SHORT_VERSION: z.string().default("unknown"),

    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
    ENABLE_FASTIFY_LOGGER: truthy.default(false),

    MANAGEMENT_API_SECRET: z.string().optional(),

    DATABASE_URL: z.string().url(),
    DATABASE_SSL_DISABLED: truthy.default(false),
    DATABASE_ALLOW_EXIT_ON_IDLE: truthy.default(false),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().default(10),

    JOB_LONG_POLLING_TIMEOUT: z.number().default(15),

    REDIS_URL: z.string().url(),

    ANTHROPIC_API_KEY: z.string().optional(),
    COHERE_API_KEY: z.string().optional(),

    SLACK_BOT_TOKEN: z.string().optional(),
    SLACK_SIGNING_SECRET: z.string().optional(),
    SLACK_CLUSTER_ID: z.string().optional(),

    SQS_RUN_PROCESS_QUEUE_URL: z.string(),
    SQS_RUN_GENERATE_NAME_QUEUE_URL: z.string(),
    SQS_CUSTOMER_TELEMETRY_QUEUE_URL: z.string(),
    SQS_EXTERNAL_TOOL_CALL_QUEUE_URL: z.string(),

    SQS_BASE_QUEUE_URL: z.string().optional(),

    LOAD_TEST_CLUSTER_ID: z.string().optional(),

    // Required in EE (Disabled by default)
    EE_DEPLOYMENT: truthy.default(false),

    APP_ORIGIN: z.string().url().optional(),

    JWKS_URL: z.string().url().optional(),
    JWT_IGNORE_EXPIRATION: truthy.default(false),

    BEDROCK_AVAILABLE: truthy.default(false),

    // Observability
    HYPERDX_API_KEY: z.string().optional(),
    ROLLBAR_ACCESS_TOKEN: z.string().optional(),
    FLAGSMITH_ENVIRONMENT_KEY: z.string().optional(),

    // Analytics
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
    ANALYTICS_BUCKET_NAME: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.MANAGEMENT_API_SECRET && !value.JWKS_URL) {
      return ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MANAGEMENT_API_SECRET or JWKS_URL is required",
        path: ["MANAGEMENT_API_SECRET", "JWKS_URL"],
      });
    }

    if (value.MANAGEMENT_API_SECRET) {
      if (value.JWKS_URL) {
        return ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MANAGEMENT_API_SECRET can not be set with JWKS_URL (Headless mode only)",
          path: ["MANAGEMENT_API_SECRET"],
        });
      }
    }

    if (!value.EE_DEPLOYMENT) {
      return;
    }
    const EE_REQUIRED = [
      "APP_ORIGIN",
      "JWKS_URL",
      "HYPERDX_API_KEY",
      "ROLLBAR_ACCESS_TOKEN",
      "FLAGSMITH_ENVIRONMENT_KEY",
      "POSTHOG_API_KEY",
      "POSTHOG_HOST",
      "ANALYTICS_BUCKET_NAME",
    ];

    for (const key of EE_REQUIRED) {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(value as any)[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required for EE Deployment`,
          path: [key],
        });
      }
    }
  });

let env: z.infer<typeof envSchema>;
try {
  env = envSchema.parse(process.env);
} catch (e: any) {
  // Use console.error rather than logger.error here because the logger
  // depends on the environment variables to be parsed
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables provided", {
    errors: JSON.stringify(e.errors),
  });
  process.exit(1);
}

export { env };
