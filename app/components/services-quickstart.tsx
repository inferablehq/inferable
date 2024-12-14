"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";

type ProgrammingLanguage = "node" | "golang" | "dotnet";

export function ServicesQuickstart({ clusterId }: { clusterId: string }) {
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] =
    useState<ProgrammingLanguage>("node");

  const getCommands = (language: ProgrammingLanguage) => {
    const baseCommands = `npm i @inferable/cli -g && \\
inf auth login`;

    const languageSpecificCommands = {
      node: `inf bootstrap node --dir=inferable-app-${clusterId}`,
      golang: `inf bootstrap go --dir=inferable-app-${clusterId}`,
      dotnet: `inf bootstrap dotnet --dir=inferable-app-${clusterId}`,
    };

    return `${baseCommands} && \\
${languageSpecificCommands[language]} && \\
cd inferable-app-${clusterId} && \\
inf auth keys create my_key --clusterId=${clusterId} --env=true && \\
${language === "node" ? "npm run dev" : language === "golang" ? "go run ." : "dotnet run"}`;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(getCommands(selectedLanguage));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-gray-200">
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold">
          Welcome to your new cluster! 🎉
        </h3>
        <p className="text-gray-600">
          Your cluster is ready to go, but it doesn&apos;t have any services
          yet. Let&apos;s fix that!
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-medium">Quick Start Guide</h4>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Select language:</span>
            <select
              value={selectedLanguage}
              onChange={(e) =>
                setSelectedLanguage(e.target.value as ProgrammingLanguage)
              }
              className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="node">Node.js</option>
              <option value="golang">Go</option>
              <option value="dotnet">.NET</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Run these commands in your terminal to create your first service:
        </p>
        <div className="space-y-2 relative">
          <button
            onClick={handleCopy}
            className="absolute right-2 top-2 px-3 py-1.5 text-sm rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <SyntaxHighlighter
            language="bash"
            style={coldarkDark}
            customStyle={{
              borderRadius: "8px",
              padding: "16px",
              margin: "0",
              fontSize: "14px",
            }}
          >
            {getCommands(selectedLanguage)}
          </SyntaxHighlighter>
        </div>
        <p className="text-sm text-gray-600">
          This will:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Install the Inferable CLI</li>
            <li>
              Create a new{" "}
              {selectedLanguage === "node"
                ? "Node.js"
                : selectedLanguage === "golang"
                  ? "Go"
                  : ".NET"}{" "}
              service
            </li>
            <li>Set up your development environment</li>
            <li>Start the development server</li>
          </ul>
        </p>

        <div className="mt-4 text-sm">
          <a
            href="https://docs.inferable.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            View full documentation
            <svg
              className="w-4 h-4 inline-block"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
