import { useMemo, useCallback } from "react";
import { createApiClient } from "../createClient";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Authentication options for using cluster-based authentication */
export type AuthOptionsCluster = {
  authType: "cluster";
  /** API secret key for cluster authentication */
  apiSecret: string;
};

/** Authentication options for using custom authentication */
export type AuthOptionsCustom = {
  authType: "custom";
  /** Custom authentication token */
  customAuthToken: string;
};

/** Combined authentication options type */
export type AuthOptions = AuthOptionsCluster | AuthOptionsCustom;

/** Configuration options for creating an Inferable client */
export type UseInferableOptions = {
  /** The cluster ID to use for the run */
  clusterId: string;
  /** Optional base URL for the API. Defaults to https://api.inferable.ai if not specified */
  baseUrl?: string;
  /** Optional pre-configured API client instance */
  apiClient?: ReturnType<typeof createApiClient>;
} & AuthOptions;

/**
 * React hook for creating and managing an Inferable API client
 * @param options Configuration options for the client
 * @returns Configured API client instance
 * @example
 * ```tsx
 * const client = useInferable({
 *   authType: "custom",
 *   customAuthToken: "my-custom-auth-token"
 * });
 * ```
 */
export function useInferable(options: UseInferableOptions): {
  client: ReturnType<typeof createApiClient>;
  clusterId: string;
  createRun: (createRunOptions: {
    initialPrompt: string;
    systemPrompt?: string;
    name?: string;
    model?: "claude-3-5-sonnet" | "claude-3-haiku";
    resultSchema?: z.ZodObject<any>;
    metadata?: Record<string, string>;
    interactive?: boolean;
  }) => Promise<{ id: string }>;
  listRuns: () => Promise<{ runs: { id: string }[] }>;
} {
  const client = useMemo(
    () =>
      options.apiClient ??
      createApiClient({
        authHeader:
          options.authType === "custom"
            ? `custom ${options.customAuthToken}`
            : `bearer ${options.apiSecret}`,
        baseUrl: options.baseUrl,
      }),
    [options]
  );

  const createRun = useCallback(
    (createRunOptions: {
      initialPrompt: string;
      systemPrompt?: string;
      name?: string;
      model?: "claude-3-5-sonnet" | "claude-3-haiku";
      resultSchema?: z.ZodObject<any>;
      metadata?: Record<string, string>;
      interactive?: boolean;
    }) => {
      return client
        .createRun({
          params: {
            clusterId: options.clusterId,
          },
          body: {
            initialPrompt: createRunOptions.initialPrompt,
            systemPrompt: createRunOptions.systemPrompt,
            name: createRunOptions.name,
            model: createRunOptions.model,
            resultSchema: createRunOptions.resultSchema
              ? zodToJsonSchema(createRunOptions.resultSchema)
              : undefined,
            metadata: createRunOptions.metadata,
            interactive: createRunOptions.interactive,
          },
        })
        .then(response => {
          if (response.status !== 201) {
            throw new Error(
              `Could not create run. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
            );
          }
          return response.body;
        });
    },
    [client, options.clusterId]
  );

  const listRuns = useCallback(() => {
    return client
      .listRuns({
        params: {
          clusterId: options.clusterId,
        },
      })
      .then(response => {
        if (response.status !== 200) {
          throw new Error(
            `Could not list runs. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
          );
        }
        const runs = Array.isArray(response.body) ? response.body : [];
        return {
          runs: runs.map(run => ({ id: String(run.id) })),
        };
      });
  }, [client, options.clusterId]);

  return {
    client,
    clusterId: options.clusterId,
    createRun,
    listRuns,
  };
}
