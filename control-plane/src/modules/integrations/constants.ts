export const toolhouseIntegration = "toolhouse";
export const langfuseIntegration = "langfuse";
export const tavilyIntegration = "tavily";

export const allowedIntegrations = [
  toolhouseIntegration,
  langfuseIntegration,
  tavilyIntegration,
] as const;

export const externalServices = [toolhouseIntegration, tavilyIntegration];
