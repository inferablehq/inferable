import { PostHog } from "posthog-node";
import { env } from "../../utilities/env";

export const posthog = env.POSTHOG_API_KEY
  ? new PostHog(env.POSTHOG_API_KEY, {
      host: env.POSTHOG_HOST,
    })
  : undefined;
