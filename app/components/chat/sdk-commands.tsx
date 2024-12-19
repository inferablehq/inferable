import React, { useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { CodeIcon, CopyIcon, CheckIcon } from "lucide-react";
import SyntaxHighlighter from "react-syntax-highlighter";
import theme from "react-syntax-highlighter/dist/cjs/styles/hljs/tomorrow";

type SDKCommandsProps = {
  clusterId: string;
  config: {
    attachedFunctions: string[];
    resultSchema: string | null;
    prompt: string;
  };
};

const SDKCommands: React.FC<SDKCommandsProps> = ({ clusterId, config }) => {
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedCLI, setCopiedCLI] = useState(false);

  const getCurlCommand = () => {
    const body: {
      message: string;
      result?: {
        schema: unknown;
      };
      attachedFunctions?: string[];
    } = {
      message: config.prompt,
    };

    if (config.resultSchema) {
      body.result = {
        schema: config.resultSchema,
      };
    }

    if (config.attachedFunctions.length > 0) {
      body.attachedFunctions = config.attachedFunctions;
    }

    // Generate curl command based on config
    return `curl -X POST "https://api.inferable.ai/clusters/${clusterId}/runs" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $INFERABLE_API_KEY" \\
  -d '${JSON.stringify(body, null, 2)}'`;
  };

  const getCLICommand = () => {
    let command = `inf runs create --cluster '${clusterId}' `;

    if (config.attachedFunctions.length > 0) {
      command += `\\\n  --attachedFunctions '${config.attachedFunctions.join(",")}' `;
    }

    if (config.resultSchema) {
      command += `\\\n  --resultSchema '${JSON.stringify(JSON.parse(config.resultSchema), null, 2)}' `;
    }

    command += `"${config.prompt}" `;

    return command;
  };

  const copyToClipboard = (
    text: string,
    setCopied: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <CodeIcon className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[800px] p-0">
        <div className="p-4">
          <Tabs defaultValue="curl" className="w-full">
            <TabsList className="mb-2">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="cli">CLI</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="space-y-2">
              <p className="text-sm">
                Execute this prompt via the{" "}
                <a
                  href="https://docs.inferable.ai/pages/api/create-run"
                  target="_blank"
                  className="text-gray-500"
                >
                  Inferable HTTP API
                </a>
              </p>
              <pre className="bg-transparent rounded-md overflow-x-auto text-sm border border-gray-200 shadow-sm">
                <SyntaxHighlighter
                  language="bash"
                  style={theme}
                  customStyle={{ backgroundColor: "transparent" }}
                >
                  {getCurlCommand()}
                </SyntaxHighlighter>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(getCurlCommand(), setCopiedCurl)}
              >
                {copiedCurl ? (
                  <>
                    <CheckIcon className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </TabsContent>
            <TabsContent value="cli" className="space-y-2">
              <p className="text-sm">
                Execute this prompt via the{" "}
                <a
                  href="https://docs.inferable.ai/pages/cli"
                  target="_blank"
                  className="text-gray-500"
                >
                  Inferable CLI
                </a>
              </p>
              <pre className="bg-transparent rounded-md overflow-x-auto text-sm border border-gray-200 shadow-sm">
                <SyntaxHighlighter
                  language="bash"
                  style={theme}
                  customStyle={{ backgroundColor: "transparent" }}
                >
                  {getCLICommand()}
                </SyntaxHighlighter>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(getCLICommand(), setCopiedCLI)}
              >
                {copiedCLI ? (
                  <>
                    <CheckIcon className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SDKCommands;
