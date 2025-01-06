"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { ReadOnlyJSON } from "@/components/read-only-json";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferRequest, ClientInferResponseBody } from "@ts-rest/core";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  PlusCircleIcon,
  Settings2Icon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import Commands from "./sdk-commands";
import { isFeatureEnabled } from "@/lib/features";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import toast from "react-hot-toast";

export type RunOptions = {
  agentId?: string;
  attachedFunctions: string[];
  resultSchema: string | null;
  reasoningTraces: boolean;
  initialPrompt: string;
  runContext: string | null;
  enableResultGrounding: boolean;
};

export function PromptTextarea({ clusterId }: { clusterId: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState<string>("");
  const { getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  const [options, setOptions] = useState({
    attachedFunctions: [] as string[],
    resultSchema: null as string | null,
    reasoningTraces: true,
    runContext: null as string | null,
    enableResultGrounding: false,
  });

  const handleOptionsChange = (newConfig: {
    attachedFunctions: string[];
    resultSchema: string | null;
    reasoningTraces: boolean;
    runContext: string | null;
    enableResultGrounding: boolean;
  }) => {
    setOptions(newConfig);
  };


  const [agents, setAgents] = useState<ClientInferResponseBody<
    typeof contract.listAgents,
    200
  > | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  const searchParams = useSearchParams();


  useEffect(() => {
    if (agents) {
      if (!selectedAgentId) {
        setOptions({
          attachedFunctions: [],
          enableResultGrounding: false,
          reasoningTraces: true,
          resultSchema: null,
          runContext: null,
        })
        return
      }

      const agent = agents.find((agent) => agent.id === selectedAgentId);

      if (!agent) {
        toast.error("Could not find Agent with ID: " + selectedAgentId);
        setSelectedAgentId(undefined);
        return
      }

      setOptions({
        attachedFunctions: agent.attachedFunctions || [],
        enableResultGrounding: false,
        reasoningTraces: true,
        resultSchema: agent.resultSchema ? JSON.stringify(agent.resultSchema, null, 2) : null,
        runContext: null,
      })
    }
  }, [selectedAgentId, agents]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  useEffect(() => {
    const queryAgentId = searchParams?.get("agentId");
    if (queryAgentId) {
      setSelectedAgentId(queryAgentId);
    }
  }, [ searchParams, setSelectedAgentId ]);

  const onSubmit = useCallback(
    async (options: RunOptions) => {
      const body: ClientInferRequest<typeof contract.createRun>["body"] = {};

      if (options.runContext) {
        body.context = JSON.parse(options.runContext);
      }

      if (options.resultSchema) {
        body.resultSchema = JSON.parse(options.resultSchema);
      }

      if (options.attachedFunctions && options.attachedFunctions.length > 0) {
        body.attachedFunctions = options.attachedFunctions?.map((fn) => {
          const [service, functionName] = fn.split("_");

          return {
            service,
            function: functionName,
          };
        });
      }

      body.initialPrompt = options.initialPrompt;
      body.agentId = options.agentId;
      body.reasoningTraces = options.reasoningTraces;
      body.enableResultGrounding = options.enableResultGrounding;

      body.interactive = true;

      const result = await client.createRun({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        body,
        params: {
          clusterId: clusterId,
        },
      });

      if (result.status !== 201) {
        createErrorToast(result, "Failed to create Run");
        return;
      } else {
        // clear everything
        setPrompt("");
        setOptions({
          attachedFunctions: [],
          resultSchema: null,
          reasoningTraces: true,
          runContext: null,
          enableResultGrounding: false,
        });
      }

      router.push(`/clusters/${clusterId}/runs/${result.body.id}`);
    },
    [clusterId, getToken, router]
  );

  const submit = () => {
    onSubmit({
      attachedFunctions: options.attachedFunctions,
      resultSchema: options.resultSchema,
      reasoningTraces: options.reasoningTraces,
      initialPrompt: prompt,
      runContext: options.runContext,
      enableResultGrounding: options.enableResultGrounding,
      agentId: selectedAgentId,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const [availableFunctions, setAvailableFunctions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  useEffect(() => {
    const fetchFunctions = async () => {
      const result = await client.listServices({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: { clusterId },
      });

      if (result.status === 200) {
        const functions = result.body.flatMap((service) =>
          (service.functions || []).map((fn) => ({
            value: `${service.name}_${fn.name}`,
            label: `${service.name}.${fn.name}`,
          }))
        );
        setAvailableFunctions(functions);
      } else {
        createErrorToast(result, "Failed to fetch Service Functions");
      }
    };

    fetchFunctions();
  }, [clusterId, getToken]);

  useEffect(() => {
    const fetchAgents = async () => {
      const result = await client.listAgents({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: { clusterId },
      });

      if (result.status === 200) {
        setAgents(result.body);
      } else {
        createErrorToast(result, "Failed to fetch Agents");
      }
    };

    fetchAgents();
  }, [clusterId, selectedAgentId, getToken, setAgents]);


  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({
    functions: true,
    schema: true,
    context: true,
    options: true,
  });

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleAllSections = (collapsed: boolean) => {
    setCollapsedSections({
      functions: collapsed,
      schema: collapsed,
      context: collapsed,
      options: collapsed,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <PlusCircleIcon className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-medium tracking-tight text-gray-600">
            Start a new run
          </h2>
          <span className="text-xs text-muted-foreground mt-1">
            Press ⌘ + Enter to send
          </span>
        </div>
        <Textarea
          ref={textareaRef}
          rows={1}
          placeholder="What would you like me to help you with?"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          className="resize-none overflow-hidden"
        />
      </div>

      <div className="space-y-2 border rounded-lg bg-gray-50/30 divide-y divide-gray-100/50">
        <div className="p-3">
          <button
            onClick={() =>
              toggleAllSections(
                !Object.values(collapsedSections).every((v) => v)
              )
            }
            className="flex items-center gap-2 text-xs text-muted-foreground w-full hover:text-primary transition-colors"
          >
            <Settings2Icon className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-wider">
              Configuration
            </span>
            {Object.values(collapsedSections).every((v) => v) ? (
              <ChevronRight className="h-3.5 w-3.5 ml-auto" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-auto" />
            )}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Configure how the AI agent processes your request and interacts with
            available tools.
          </p>
        </div>

        {/* Agent Section */}
        <div className="px-3 py-2">
          <div
            className="flex items-center gap-2 w-full text-xs hover:text-primary transition-colors"
          >
            <Bot className="h-3.5 w-3.5" />
            <span className="font-medium">Agent</span>
          </div>
          {agents && agents.length > 0 && (
            <div>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
                Configure this Run using an <a className="text-blue-500 hover:underline" href={`/clusters/${clusterId}/agents`}>Agent</a>
            </p>
            <Select onValueChange={(selected) => selected == "none" ? setSelectedAgentId(undefined) : setSelectedAgentId(selected)} value={selectedAgentId ?? "none"}>
              <SelectTrigger>
                <SelectValue placeholder="Select an Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {agents.map((agent) => (
                    <SelectItem
                      key={agent.id}
                      value={agent.id}
                    >
                      {agent.name}
                    </SelectItem>
                  ))}
                  <SelectItem key="none" value={"none"}>None</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            </div>
          )}

          {agents && agents.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              No Agents found for this Cluster. <a className="text-blue-500 hover:underline" href={`/clusters/${clusterId}/agents`}>Create one here</a>.
            </p>
          )}

          { !!selectedAgentId && (
            <p className="text-md text-muted-foreground mt-2">
              Run options can not be configured when using an Agent.
              The Run options will be those defined by <a className="text-blue-500 hover:underline" href={`/clusters/${clusterId}/agents/${selectedAgentId}/edit`}>Agent {selectedAgentId}</a>
            </p>
          )}
        </div>

        {/* Functions Section */}
        <div className="px-3 py-2">
          <button
            className="flex items-center gap-2 w-full text-xs hover:text-primary transition-colors"
            onClick={() => toggleSection("functions")}
          >
            {collapsedSections.functions ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Attached Functions</span>
            <span className="text-[11px] text-muted-foreground ml-2">
              {options.attachedFunctions.length} selected
            </span>
          </button>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Select tools and APIs that the AI can use to help complete your
            request. The agent will automatically determine when to use these
            functions.
          </p>
          <div className={cn("mt-2", collapsedSections.functions && "hidden")}>
            { !!selectedAgentId ? (
              <pre className="bg-gray-5 border rounded-md p-2">
                {JSON.stringify(options.attachedFunctions, null, 2)}
              </pre>

            ) : (
              <MultiSelect
                value={options.attachedFunctions}
                onChange={(value) =>
                  handleOptionsChange({
                    ...options,
                    attachedFunctions: value,
                  })
                }
                options={availableFunctions}
              />
            )}

          </div>
        </div>

        {/* Schema Section */}
        <div className="px-3 py-2">
          <button
            className="flex items-center gap-2 w-full text-xs hover:text-primary transition-colors"
            onClick={() => toggleSection("schema")}
          >
            {collapsedSections.schema ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Result Schema</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Define a JSON schema to get structured output from the AI. The agent
            will format its response to match your specified schema.
            See the <a
                        className="text-blue-500 hover:underline"
                        href="https://docs.inferable.ai/pages/runs#resultschema"
                      > Docs</a> for details.
          </p>
          <div
            className={cn(
              "mt-2 space-y-2",
              collapsedSections.schema && "hidden"
            )}
          >
            <Textarea
              value={options.resultSchema || ""}
              disabled={!!selectedAgentId}
              onChange={(e) =>
                handleOptionsChange({
                  ...options,
                  resultSchema: e.target.value,
                })
              }
              placeholder="Enter JSON schema..."
              className="font-mono text-xs bg-white/50"
            />
            {options.resultSchema && (
              <div className="rounded-md overflow-hidden border border-gray-100">
                {(() => {
                  try {
                    JSON.parse(options.resultSchema);
                    return <ReadOnlyJSON json={options.resultSchema} />;
                  } catch (e) {
                    return (
                      <div className="text-[11px] text-red-600 bg-red-50 p-2 border-t">
                        Invalid JSON schema
                      </div>
                    );
                  }
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Context Section */}
        <div className="px-3 py-2">
          <button
            className="flex items-center gap-2 w-full text-xs hover:text-primary transition-colors"
            onClick={() => toggleSection("context")}
          >
            {collapsedSections.context ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Run Context</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1 mb-2">

            Provide additional context as JSON that will be passed into all function calls.
            It is <span className="font-bold">not</span> visible to the agent.
            See the <a
                        className="text-blue-500 hover:underline"
                        href="https://docs.inferable.ai/pages/runs#context"
                      > Docs</a> for details.
          </p>
          <div
            className={cn(
              "mt-2 space-y-2",
              collapsedSections.context && "hidden"
            )}
          >
            <Textarea
              value={options.runContext || ""}
              disabled={!!selectedAgentId}
              onChange={(e) =>
                handleOptionsChange({
                  ...options,
                  runContext: e.target.value,
                })
              }
              placeholder="Enter context as JSON..."
              className="font-mono text-xs bg-white/50"
            />
            {options.runContext && (
              <div className="rounded-md overflow-hidden border border-gray-100">
                {(() => {
                  try {
                    JSON.parse(options.runContext);
                    return <ReadOnlyJSON json={options.runContext} />;
                  } catch (e) {
                    return (
                      <div className="text-[11px] text-red-600 bg-red-50 p-2 border-t">
                        Invalid JSON context
                      </div>
                    );
                  }
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Options Section */}
        <div className="px-3 py-2">
          <button
            className="flex items-center gap-2 w-full text-xs hover:text-primary transition-colors"
            onClick={() => toggleSection("options")}
          >
            {collapsedSections.options ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Options</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Configure how the AI agent processes your request and interacts with
            available tools.
          </p>
          <div
            className={cn(
              "mt-2 space-y-4",
              collapsedSections.options && "hidden"
            )}
          >
            <div className="flex items-center space-x-2">
              <Switch
                checked={options.reasoningTraces}
                disabled={!!selectedAgentId}
                onCheckedChange={(checked) =>
                  handleOptionsChange({
                    ...options,
                    reasoningTraces: checked,
                  })
                }
                className="scale-75 data-[state=checked]:bg-primary"
              />
              <label className="text-xs text-muted-foreground">
                Enable reasoning traces
              </label>
            </div>
            {isFeatureEnabled("feature.result_grounding") && (
              <div className={"flex items-center space-x-2"}>
                <Switch
                  checked={options.enableResultGrounding}
                  disabled={!!selectedAgentId}
                  onCheckedChange={(checked) =>
                    handleOptionsChange({
                      ...options,
                      enableResultGrounding: checked,
                    })
                  }
                  className="scale-75 data-[state=checked]:bg-primary"
                />
                <label className="text-xs text-muted-foreground">
                  Enable result grounding
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>
          Start Run
        </Button>
        {prompt.length > 3 && (
          <Commands
            clusterId={clusterId}
            config={{
              attachedFunctions: options.attachedFunctions,
              resultSchema: options.resultSchema,
              prompt,
            }}
          />
        )}
      </div>
    </div>
  );
}
