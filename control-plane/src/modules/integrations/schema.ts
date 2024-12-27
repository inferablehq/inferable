import { z } from "zod";
import {
  toolhouseIntegration,
  langfuseIntegration,
  tavilyIntegration,
  valtownIntegration,
  slackIntegration,
} from "./constants";

export const integrationSchema = z.object({
  [toolhouseIntegration]: z
    .object({
      apiKey: z.string(),
    })
    .optional()
    .nullable(),
  [langfuseIntegration]: z
    .object({
      publicKey: z.string(),
      secretKey: z.string(),
      baseUrl: z.string(),
      sendMessagePayloads: z.boolean(),
    })
    .optional()
    .nullable(),
  [tavilyIntegration]: z
    .object({
      apiKey: z.string(),
    })
    .optional()
    .nullable(),
  [valtownIntegration]: z
    .object({
      endpoint: z.string().url(),
    })
    .optional()
    .nullable(),
  [slackIntegration]: z
    .object({
      nangoConnectionId: z.string(),
      botUserId: z.string(),
      teamId: z.string(),
    })
    .optional()
    .nullable(),
});
