export const toolhouseIntegration = "toolhouse";
export const langfuseIntegration = "langfuse";
export const tavilyIntegration = "tavily";
export const valTownIntegration = "valTown";

export const allowedIntegrations = [
  toolhouseIntegration,
  langfuseIntegration,
  tavilyIntegration,
  valTownIntegration,
] as const;

export const externalServices = [toolhouseIntegration, tavilyIntegration, valTownIntegration];
