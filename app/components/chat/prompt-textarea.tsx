"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { ReadOnlyJSON } from "@/components/read-only-json";
import { MultiSelect } from "@/components/ui/multi-select";
import { SendButton } from "@/components/ui/send-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isFeatureEnabled } from "@/lib/features";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferRequest } from "@ts-rest/core";
import {
  Blocks,
  Bot,
  ChevronDown,
  ChevronRight,
  Cog,
  PlusCircleIcon,
  Settings2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { useClusterState } from "../useClusterState";
import Commands from "./sdk-commands";
import { QuickStartDemo } from "../quick-start-demo";

export type RunOptions = {
  attachedFunctions: string[];
  resultSchema: string | null;
  reasoningTraces: boolean;
  initialPrompt: string;
  runContext: string | null;
  enableResultGrounding: boolean;
};

const demoServicePrompts = [
  {
    text: "Get me data about all the employees at Dunder Mifflin from sqlite",
    description: [
      "Reads the sqlite schema to understand the data structure.",
      "Queries the sqlite database to get the data.",
    ],
  },
  {
    text: "Move all the Acme Corp employees to Dunder Mifflin in sqlite",
    description: [
      "Reads the sqlite schema to understand the data structure.",
      "Queries the sqlite database to get the data.",
      "Updates the sqlite database to move the data.",
    ],
  },
  {
    text: "Can you give me my system information?",
    description: [
      "Selects a command on the terminal from an allow-list.",
      "Asks for your approval before running it.",
    ],
  },
] as const;

type DemoPrompt = (typeof demoServicePrompts)[number];

export function PromptTextarea({ clusterId }: { clusterId: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState<string>("");
  const { getToken } = useAuth();
  const router = useRouter();
  const { services, machines, isLoading, cluster } = useClusterState(clusterId);
  const [availableFunctions, setAvailableFunctions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  useEffect(() => {
    const functions = services.flatMap(service =>
      (service.functions || []).map(fn => ({
        value: `${service.name}_${fn.name}`,
        label: `${service.name}.${fn.name}`,
      }))
    );
    setAvailableFunctions(functions);
  }, [services]);

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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

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
        body.attachedFunctions = options.attachedFunctions?.map(fn => {
          const [service, functionName] = fn.split("_");

          return {
            service,
            function: functionName,
          };
        });
      }

      body.initialPrompt = options.initialPrompt;
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
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => ({
    functions: true,
    schema: true,
    context: true,
    options: true,
  }));

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };


  const noServicesAndMachines = !services.length && !machines.length;

  const isDemoService =
    cluster?.isDemo &&
    services.some(service => service.name === "sqlite") &&
    services.some(service => service.name === "terminal");

  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);

  useEffect(() => {
    if (isDemoService) {
      setIsConfigCollapsed(true);
    }
  }, [isDemoService]);

  const handleDemoPromptClick = (prompt: DemoPrompt) => {
    setPrompt(prompt.text);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="space-y-6">
      {isDemoService && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-sm font-semibold shadow-sm">
              1
            </div>
            <p className="text-base font-semibold text-gray-800">
              Great! You&apos;ve connected a couple of services. They are ready to use.
            </p>
          </div>
          <div className="rounded-xl p-5 shadow-sm border border-green-100 bg-green-50/30 transition-all duration-200">
            <div className="grid grid-cols-2 divide-x divide-green-100">
              <div className="pr-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Blocks className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">SQLite Service</div>
                    <div className="text-xs text-muted-foreground">
                      Employee database for fictional companies
                    </div>
                  </div>
                  <a
                    href="https://github.com/inferablehq/inferable/blob/main/demos/typescript/sql-to-text/service.ts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/90 hover:underline whitespace-nowrap"
                  >
                    View Source →
                  </a>
                </div>
              </div>

              <div className="pl-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Blocks className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Terminal Copilot</div>
                    <div className="text-xs text-muted-foreground">
                      Run terminal commands with approval
                    </div>
                  </div>
                  <a
                    href="https://github.com/inferablehq/inferable/blob/main/demos/typescript/terminal-copilot/service.ts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/90 hover:underline whitespace-nowrap"
                  >
                    View Source →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-sm font-semibold shadow-sm">
                2
              </div>
              <div className="text-base font-semibold text-gray-800">
                Try these example prompts to see how Inferable works
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {demoServicePrompts.map((demoPrompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDemoPromptClick(demoPrompt)}
                  className="text-left h-auto flex flex-col items-start p-3"
                >
                  <span className="font-medium">{demoPrompt.text}</span>
                  {demoPrompt.description.map((description, index) => (
                    <span key={index} className="text-xs text-muted-foreground mt-1">
                      {index + 1}. {description}
                    </span>
                  ))}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}

      {noServicesAndMachines && !isLoading && (
        <div className="flex-grow-0">
          <QuickStartDemo clusterId={clusterId} />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <PlusCircleIcon className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-medium tracking-tight text-gray-600">Start a new run</h2>
          <span className="text-xs text-muted-foreground mt-1">Press ⌘ + Enter to send</span>
        </div>
        <Textarea
          ref={textareaRef}
          rows={1}
          placeholder="What would you like me to help you with?"
          value={prompt}
          onChange={e => {
            setPrompt(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          className="resize-none overflow-hidden react-joyride-prompt-textarea"
        />
        {!noServicesAndMachines && (
          <button
            onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Settings2Icon className="h-3 w-3" />
            {isConfigCollapsed ? "Show configuration" : "Hide configuration"}
          </button>
        )}
      </div>

      <div
        className={cn(
          "space-y-2 border rounded-lg bg-gray-50/30",
          (noServicesAndMachines || isConfigCollapsed) && "hidden"
        )}
      >
        <div className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground w-full">
            <Settings2Icon className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-wider">Configuration</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Configure how Inferable will process your request and interact with available tools.
          </p>
        </div>

        <div className="px-3 py-4 border-b">
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
            Select tools and APIs that the AI can use to help complete your request. The agent
            will automatically determine when to use these functions.
          </p>
          <div className={cn("mt-2", collapsedSections.functions && "hidden")}>
            <MultiSelect
              value={options.attachedFunctions}
              onChange={value =>
                handleOptionsChange({
                  ...options,
                  attachedFunctions: value,
                })
              }
              options={availableFunctions}
            />
          </div>
        </div>

        {/* Schema Section */}
        <div className="px-3 py-4 border-b">
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
            Define a JSON schema to get structured output from the AI. The agent will format its
            response to match your specified schema. See the{" "}
            <a
              className="text-xs text-primary hover:text-primary/90 hover:underline"
              href="https://docs.inferable.ai/pages/runs#resultschema"
            >
              {" "}
              Docs
            </a>{" "}
            for details.
          </p>
          <div className={cn("mt-2 space-y-2", collapsedSections.schema && "hidden")}>
            <Textarea
              value={options.resultSchema || ""}
              onChange={e =>
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
        <div className="px-3 py-4 border-b">
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
            Provide additional context as JSON that will be passed into all function calls. It
            is <span className="font-bold">not</span> visible to the agent. See the{" "}
            <a
              className="text-xs text-primary hover:text-primary/90 hover:underline"
              href="https://docs.inferable.ai/pages/runs#context"
            >
              {" "}
              Docs
            </a>{" "}
            for details.
          </p>
          <div className={cn("mt-2 space-y-2", collapsedSections.context && "hidden")}>
            <Textarea
              value={options.runContext || ""}
              onChange={e =>
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
        <div className="px-3 py-4">
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
            Configure how the AI agent processes your request and interacts with available
            tools.
          </p>
          <div className={cn("mt-2 space-y-4", collapsedSections.options && "hidden")}>
            <div className="flex items-center space-x-2">
              <Switch
                checked={options.reasoningTraces}
                onCheckedChange={checked =>
                  handleOptionsChange({
                    ...options,
                    reasoningTraces: checked,
                  })
                }
                className="scale-75 data-[state=checked]:bg-primary"
              />
              <label className="text-xs text-muted-foreground">Enable reasoning traces</label>
            </div>
            {isFeatureEnabled("feature.result_grounding") && (
              <div className={"flex items-center space-x-2"}>
                <Switch
                  checked={options.enableResultGrounding}
                  onCheckedChange={checked =>
                    handleOptionsChange({
                      ...options,
                      enableResultGrounding: checked,
                    })
                  }
                  className="scale-75 data-[state=checked]:bg-primary"
                />
                <label className="text-xs text-muted-foreground">Enable result grounding</label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <SendButton onClick={submit} disabled={prompt.length < 3} />
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
