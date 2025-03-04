export const toolhouseIntegration = "toolhouse";
export const langfuseIntegration = "langfuse";
export const tavilyIntegration = "tavily";
export const valtownIntegration = "valtown";
export const slackIntegration = "slack";

export const allowedIntegrations = [
  toolhouseIntegration,
  langfuseIntegration,
  tavilyIntegration,
  valtownIntegration,
  slackIntegration,
] as const;

export const externalServices = [
  toolhouseIntegration,
  tavilyIntegration,
  valtownIntegration,
];

// Special value that allows a new connection to be created
export const NEW_CONNECTION_ID = "NEW";
