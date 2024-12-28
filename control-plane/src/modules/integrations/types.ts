import { z } from "zod";
import { integrationSchema } from "./schema";
import { getJob } from "../jobs/jobs";

export type InstallableIntegration = {
  name: string;
  onActivate: (
    clusterId: string,
    config: z.infer<typeof integrationSchema>,
    prevConfig: z.infer<typeof integrationSchema>
  ) => Promise<void>;
  onDeactivate: (
    clusterId: string,
    config: z.infer<typeof integrationSchema>,
    prevConfig: z.infer<typeof integrationSchema>
  ) => Promise<void>;
  handleCall: (
    call: NonNullable<Awaited<ReturnType<typeof getJob>>>,
    config: z.infer<typeof integrationSchema>
  ) => Promise<void>;
};
