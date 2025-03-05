import Flagsmith from "flagsmith-nodejs";
import { env } from "../../utilities/env";

export const flagsmith = env.FLAGSMITH_ENVIRONMENT_KEY
  ? new Flagsmith({
      environmentKey: env.FLAGSMITH_ENVIRONMENT_KEY,
      enableLocalEvaluation: true,
      environmentRefreshIntervalSeconds: 60 * 10,
    })
  : undefined;
