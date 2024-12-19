"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Textarea } from "@/components/ui/textarea";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferRequest } from "@ts-rest/core";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { InputFields } from "./input-fields";
import RunConfig from "./run-config";
import Commands from "./sdk-commands";
import { TemplateSearch } from "./template-search";

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
            ]),
          ),
        };
      } else {
        body.initialPrompt = config.prompt.replace(/{{.*?}}/g, "");
      }

      if(config.runContext) {
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
          runContext: null
        });
      }

      router.push(`/clusters/${clusterId}/runs/${result.body.id}`);
    },
    [clusterId, getToken, router],
  );

  const submit = () => {
    let updatedPrompt = prompt;

    if (!selectedTemplate) {
      updatedPrompt = prompt;

      Object.entries(storedInputs).forEach(([input, inputValue]) => {
        if (inputValue) {
          updatedPrompt = updatedPrompt.replace(
            new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
            `<data>${input.replace(/[{}]/g, "")}: ${inputValue}</data>`,
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

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        rows={1}
        placeholder="Message Inferable"
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
      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>
          Start Run
        </Button>
        <RunConfig config={runConfig} onConfigChange={handleConfigChange} />
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
      <TemplateSearch
        prompt={prompt}
        onSelect={selectConfig}
        clusterId={clusterId}
      />
    </div>
  );
}
