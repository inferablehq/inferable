import { SettingsIcon } from "lucide-react";
import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";
import { ToolInput } from "./tool-input";
import { Checkbox } from "../ui/checkbox";

type RunConfigProps = {
  config: {
    attachedFunctions: string[];
    resultSchema: string | null;
    reasoningTraces: boolean;
    runContext: string | null;
  };
  onConfigChange: (newConfig: {
    attachedFunctions: string[];
    resultSchema: string | null;
    reasoningTraces: boolean;
    runContext: string | null;
  }) => void;
};

const RunConfig: React.FC<RunConfigProps> = ({ config, onConfigChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [attachedFunctions, setAttachedFunctions] = useState<string[]>(
    config.attachedFunctions.filter(Boolean),
  );


  const [runContext, setRunContext] = useState<string | null>(
    config.runContext ? JSON.stringify(config.runContext) : null,
  );

  const [resultSchema, setResultSchema] = useState<string | null>(
    config.resultSchema,
  );

  const [reasoningTraces, setReasoningTraces] = useState(
    config.reasoningTraces,
  );

  const hasConfig = attachedFunctions.length > 0 || !!resultSchema;

  const handleApplyConfig = () => {
    if (resultSchema) {
      try {
        JSON.parse(resultSchema);
        setResultSchemaJsonInvalid(false);
      } catch (e) {
        toast.error("Invalid JSON in result schema");
        return;
      }
    }

    if (runContext) {
      try {
        JSON.parse(runContext);
        setRunContextJsonInvalid(false);
      } catch (e) {
        toast.error("Invalid JSON in run context");
        return;
      }
    }

    onConfigChange({
      attachedFunctions,
      resultSchema,
      reasoningTraces,
      runContext,
    });
    setIsOpen(false);
  };

  const [resultSchemaJsonInvalid, setResultSchemaJsonInvalid] = useState(false);
  const [runContextJsonInvalid, setRunContextJsonInvalid] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="relative">
          <SettingsIcon className="w-4 h-4 mr-2" />
          Run Config
          {hasConfig && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px]">
        <div className="space-y-4">
          <h3 className="font-semibold">Run Configuration</h3>
          <p className="text-xs text-gray-500">
            <a href="https://docs.inferable.ai/pages/runs#options" className="underline">
              Options
            </a> to invoke the run with
          </p>
          <div className="space-x-2 flex flex-row items-center">
            <Checkbox
              checked={reasoningTraces}
              onCheckedChange={(checked) => setReasoningTraces(!!checked)}
            ></Checkbox>
            <Label>Enable Reasoning Traces</Label>
          </div>
          <div className="space-y-2">
            <Label>Attached Functions</Label>
            <p className="text-xs text-gray-500">
              Select the functions that the run will be able to use. If none
              selected, all functions will be available.
            </p>
            <ToolInput
              value={attachedFunctions}
              onChange={setAttachedFunctions}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="input-result-schema">
              Result Schema (JSON Schema)
            </Label>
            <p className="text-xs text-gray-500">
              A{" "}
              <a href="https://docs.inferable.ai/pages/runs#resultschema" className="underline">
                 Result Schema
              </a>{" "}
              that the run must return
            </p>
            <Textarea
              id="input-result-schema"
              value={resultSchema ?? ""}
              onChange={(e) => setResultSchema(e.target.value || null)}
              onBlur={() => {
                if (resultSchema) {
                  try {
                    JSON.parse(resultSchema);
                    setResultSchemaJsonInvalid(false);
                  } catch (e) {
                    setResultSchemaJsonInvalid(true);
                  }
                } else {
                  setResultSchemaJsonInvalid(false);
                }
              }}
            />
            {resultSchemaJsonInvalid && (
              <p className="text-xs text-red-500">Invalid JSON</p>
            )}

          </div>

          <div className="space-y-2">
            <Label htmlFor="input-run-context">
              Run Context
            </Label>
            <p className="text-xs text-gray-500">
              A{" "}
              <a href="https://docs.inferable.ai/pages/runs#context" className="underline">
                Run Context
              </a>{" "}
              object which is passed to all calls
            </p>
            <Textarea
              id="input-run-context"
              value={runContext ?? ""}
              onChange={(e) => setRunContext(e.target.value || null)}
              onBlur={() => {
                if (runContext) {
                  try {
                    JSON.parse(runContext);
                    setRunContextJsonInvalid(false);
                  } catch (e) {
                    setRunContextJsonInvalid(true);
                  }
                } else {
                  setRunContextJsonInvalid(false);
                }
              }}
            />
            {runContextJsonInvalid && (
              <p className="text-xs text-red-500">Invalid JSON</p>
            )}
          </div>
          <Button onClick={handleApplyConfig}>Apply Configuration</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default RunConfig;
