import { z } from "zod";
import { integrationSchema } from "./schema";
import { getJob } from "../jobs/jobs";

export type InstallableIntegration = {
  name: string;
  onActivate: (clusterId: string, integrations: z.infer<typeof integrationSchema>) => Promise<void>;
  onDeactivate: (
    clusterId: string,
    integrations: z.infer<typeof integrationSchema>,
    existing: z.infer<typeof integrationSchema>
  ) => Promise<void>;
  handleCall: (
    call: NonNullable<Awaited<ReturnType<typeof getJob>>>,
    integrations: z.infer<typeof integrationSchema>
  ) => Promise<void>;
};
