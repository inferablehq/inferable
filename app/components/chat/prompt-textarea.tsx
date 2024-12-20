"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { ReadOnlyJSON } from "@/components/read-only-json";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferRequest } from "@ts-rest/core";
import {
  ChevronDown,
  ChevronRight,
  PlusCircleIcon,
  Settings2Icon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { InputFields } from "./input-fields";
import Commands from "./sdk-commands";

export type RunConfiguration = {
  attachedFunctions: string[];
  resultSchema: string | null;
  reasoningTraces: boolean;
  prompt: string;
  template?: {
    id: string;
    input: Record<string, string>;
  };
  runContext: string | null;
};

export function PromptTextarea({ clusterId }: { clusterId: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
    // Update inputs when value changes
    const newInputs = prompt.match(/{{.*?}}/g) || [];
    setInputs(newInputs);
  }, [prompt]);

  const [runConfig, setRunConfig] = useState({
    attachedFunctions: [] as string[],
    resultSchema: null as string | null,
    reasoningTraces: true,
    runContext: null as string | null,
  });

  const handleConfigChange = (newConfig: {
    attachedFunctions: string[];
    resultSchema: string | null;
    reasoningTraces: boolean;
    runContext: string | null;
  }) => {
    setRunConfig(newConfig);
  };

  const [storedInputs, setStoredInputs] = useState<Record<string, string>>({});

  const onSubmit = useCallback(
    async (config: RunConfiguration) => {
      const body: ClientInferRequest<typeof contract.createRun>["body"] = {};

      if (config.template?.id) {
        body.template = {
          id: config.template.id,
          input: Object.fromEntries(
            Object.entries(config.template.input).map(([key, value]) => [
              key.replaceAll("{{", "").replaceAll("}}", ""),
              value,
            ])
          ),
        };
      } else {
        body.initialPrompt = config.prompt.replace(/{{.*?}}/g, "");
      }

      if (config.runContext) {
        body.context = JSON.parse(config.runContext);
      }

      if (config.resultSchema) {
        body.resultSchema = JSON.parse(config.resultSchema);
      }

      if (config.attachedFunctions && config.attachedFunctions.length > 0) {
        body.attachedFunctions = config.attachedFunctions?.map((fn) => {
          const [service, functionName] = fn.split("_");

          return {
            service,
            function: functionName,
          };
        });
      }

      body.reasoningTraces = config.reasoningTraces;

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
        createErrorToast(result, "Failed to create workflow");
        return;
      } else {
        // clear everything
        setPrompt("");
        setSelectedTemplate(null);
        setStoredInputs({});
        setRunConfig({
          attachedFunctions: [],
          resultSchema: null,
          reasoningTraces: true,
          runContext: null,
        });
      }

      router.push(`/clusters/${clusterId}/runs/${result.body.id}`);
    },
    [clusterId, getToken, router]
  );

  const submit = () => {
    let updatedPrompt = prompt;

    if (!selectedTemplate) {
      updatedPrompt = prompt;

      Object.entries(storedInputs).forEach(([input, inputValue]) => {
        if (inputValue) {
          updatedPrompt = updatedPrompt.replace(
            new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
            `<data>${input.replace(/[{}]/g, "")}: ${inputValue}</data>`
          );
        }
      });

      setPrompt(updatedPrompt);
    }

    onSubmit({
      attachedFunctions: runConfig.attachedFunctions,
      resultSchema: runConfig.resultSchema,
      reasoningTraces: runConfig.reasoningTraces,
      prompt: updatedPrompt,
      runContext: runConfig.runContext,
      template: selectedTemplate
        ? {
            id: selectedTemplate.id,
            input: storedInputs,
          }
        : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const selectConfig = (template: {
    id: string;
    name: string;
    attachedFunctions: string[];
    structuredOutput?: unknown;
    initialPrompt?: string | null;
  }) => {
    setRunConfig({
      attachedFunctions: template.attachedFunctions,
      resultSchema: template.structuredOutput
        ? JSON.stringify(template.structuredOutput)
        : null,
      runContext: null,
      reasoningTraces: true,
    });
    template.initialPrompt && setPrompt(template.initialPrompt);
    setSelectedTemplate({
      id: template.id,
      name: template.name,
    });
  };

  const searchParams = useSearchParams();
  const promptIdQuery = searchParams?.get("promptId");
  const promptQuery = searchParams?.get("prompt");

  useEffect(() => {
    const fetchPrompt = async (configId: string) => {
      const result = await client.getRunConfig({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: clusterId,
          configId,
        },
      });

      if (result.status === 200) {
        selectConfig(result.body);
      }
    };

    if (promptIdQuery) {
      fetchPrompt(promptIdQuery);
    } else if (promptQuery) {
      setPrompt(promptQuery);
    }
  }, [promptIdQuery, promptQuery, clusterId, getToken]);

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
      }
    };

    fetchFunctions();
  }, [clusterId, getToken]);

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
            setSelectedTemplate(null);
          }}
          onKeyDown={handleKeyDown}
          className="resize-none overflow-hidden"
        />
        {selectedTemplate && (
          <p className="text-xs text-muted-foreground ml-1">
            Using run config: {selectedTemplate.name}
          </p>
        )}
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
              {runConfig.attachedFunctions.length} selected
            </span>
          </button>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Select tools and APIs that the AI can use to help complete your
            request. The agent will automatically determine when to use these
            functions.
          </p>
          <div className={cn("mt-2", collapsedSections.functions && "hidden")}>
            <MultiSelect
              value={runConfig.attachedFunctions}
              onChange={(value) =>
                handleConfigChange({
                  ...runConfig,
                  attachedFunctions: value,
                })
              }
              options={availableFunctions}
            />
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
          </p>
          <div
            className={cn(
              "mt-2 space-y-2",
              collapsedSections.schema && "hidden"
            )}
          >
            <Textarea
              value={runConfig.resultSchema || ""}
              onChange={(e) =>
                handleConfigChange({
                  ...runConfig,
                  resultSchema: e.target.value,
                })
              }
              placeholder="Enter JSON schema..."
              className="font-mono text-xs bg-white/50"
            />
            {runConfig.resultSchema && (
              <div className="rounded-md overflow-hidden border border-gray-100">
                {(() => {
                  try {
                    JSON.parse(runConfig.resultSchema);
                    return <ReadOnlyJSON json={runConfig.resultSchema} />;
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
            Provide additional context as JSON that the AI can reference during
            execution. This helps inform the agent&apos;s decision-making
            process.
          </p>
          <div
            className={cn(
              "mt-2 space-y-2",
              collapsedSections.context && "hidden"
            )}
          >
            <Textarea
              value={runConfig.runContext || ""}
              onChange={(e) =>
                handleConfigChange({
                  ...runConfig,
                  runContext: e.target.value,
                })
              }
              placeholder="Enter context as JSON..."
              className="font-mono text-xs bg-white/50"
            />
            {runConfig.runContext && (
              <div className="rounded-md overflow-hidden border border-gray-100">
                {(() => {
                  try {
                    JSON.parse(runConfig.runContext);
                    return <ReadOnlyJSON json={runConfig.runContext} />;
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
            <span className="font-medium">Reasoning Traces</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Enable reasoning traces to see the agent&apos;s step-by-step thought
            process as it works on your request.
          </p>
          <div className={cn("mt-2", collapsedSections.options && "hidden")}>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={runConfig.reasoningTraces}
                onCheckedChange={(checked) =>
                  handleConfigChange({
                    ...runConfig,
                    reasoningTraces: checked as boolean,
                  })
                }
              />
              <label className="text-xs text-muted-foreground">
                Enable reasoning traces
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>
          Start Run
        </Button>
        {inputs.length > 0 && (
          <InputFields inputs={inputs} onApply={setStoredInputs} />
        )}
        {prompt.length > 3 && (
          <Commands
            clusterId={clusterId}
            config={{
              attachedFunctions: runConfig.attachedFunctions,
              resultSchema: runConfig.resultSchema,
              prompt,
            }}
          />
        )}
      </div>
    </div>
  );
}
