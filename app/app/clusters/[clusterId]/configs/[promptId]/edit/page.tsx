"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  JobMetricsCharts,
  PromptMetricsCharts,
} from "@/components/PromptMetricsCharts";
import { PromptTemplateForm } from "@/components/chat/prompt-template-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";

export default function EditPromptTemplate({
  params,
}: {
  params: { clusterId: string; promptId: string };
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [promptTemplate, setPromptTemplate] = useState<ClientInferResponseBody<
    typeof contract.getRunConfig,
    200
  > | null>(null);
  const { getToken } = useAuth();

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const [metrics, setMetrics] = useState<ClientInferResponseBody<
    typeof contract.getRunConfigMetrics
  > | null>(null);

  const fetchPromptTemplate = useCallback(async () => {
    try {
      const response = await client.getRunConfig({
        params: { clusterId: params.clusterId, configId: params.promptId },
        query: {
          withPreviousVersions: "true",
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        setPromptTemplate(response.body);
        setSelectedVersion(null);
      } else {
        createErrorToast(response, "Failed to fetch prompt template");
      }
    } catch (error) {
      toast.error(
        `An error occurred while fetching the prompt template: ${error}`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [params.clusterId, params.promptId, getToken]);

  useEffect(() => {
    fetchPromptTemplate();
  }, [fetchPromptTemplate]);

  const handleSubmit = async (formData: {
    name: string;
    initialPrompt?: string;
    systemPrompt?: string;
    attachedFunctions: string;
    resultSchema?: string;
    inputSchema?: string;
  }) => {
    try {
      const response = await client.upsertRunConfig({
        params: { clusterId: params.clusterId, configId: params.promptId },
        body: {
          initialPrompt:
            formData.initialPrompt === "" ? undefined : formData.initialPrompt,
          systemPrompt:
            formData.systemPrompt === "" ? undefined : formData.systemPrompt,
          name: formData.name === "" ? undefined : formData.name,
          resultSchema: formData.resultSchema
            ? JSON.parse(formData.resultSchema)
            : undefined,
          inputSchema: formData.inputSchema
            ? JSON.parse(formData.inputSchema)
            : undefined,
          attachedFunctions: formData.attachedFunctions
            .split(",")
            .map((f) => f.trim())
            .filter((f) => f !== ""),
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        toast.success("Run config updated successfully");
        router.push(`/clusters/${params.clusterId}/configs`);
      } else {
        toast.error(`Failed to update prompt template: ${response.status}`);
      }
    } catch (error) {
      toast.error(`An error occurred while updating the run config: ${error}`);
    }
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      const response = await client.getRunConfigMetrics({
        params: { clusterId: params.clusterId, configId: params.promptId },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        setMetrics(response.body);
      } else {
        toast.error(`Failed to fetch metrics: ${response.status}`);
      }
    };

    fetchMetrics();
  }, [params.clusterId, params.promptId, getToken]);

  if (isLoading) {
    return <div className="">Loading...</div>;
  }

  if (!promptTemplate) {
    return <div className="">Prompt template not found</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Update Run Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Modify your run configuration below.
          </p>
          <div className="flex space-x-2 mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">
                  Switch Version <ChevronDownIcon className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-32">
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      fetchPromptTemplate();
                      toast.success("Switched to current version");
                    }}
                  >
                    Current
                  </Button>
                  {promptTemplate.versions
                    .sort((a, b) => b.version - a.version)
                    .map((version) => (
                      <Button
                        key={version.version}
                        variant="ghost"
                        className={cn(
                          "w-full justify-start",
                          selectedVersion === version.version
                            ? "bg-accent"
                            : "",
                        )}
                        onClick={() => {
                          setPromptTemplate({
                            ...promptTemplate,
                            name: version.name,
                            initialPrompt: version.initialPrompt,
                            systemPrompt: version.systemPrompt,
                            attachedFunctions: version.attachedFunctions,
                            resultSchema: version.resultSchema,
                            inputSchema: version.inputSchema,
                          });
                          setSelectedVersion(version.version);
                          toast.success(
                            `Switched to version v${version.version}`,
                          );
                        }}
                      >
                        v{version.version}
                      </Button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="secondary"
              onClick={() => {
                router.push(
                  `/clusters/${params.clusterId}/runs?filters=${encodeURIComponent(
                    JSON.stringify({
                      configId: params.promptId,
                    }),
                  )}`,
                );
              }}
            >
              Show runs
            </Button>
          </div>
          <PromptTemplateForm
            key={selectedVersion ?? "latest"}
            initialData={{
              name: promptTemplate.name,
              initialPrompt: promptTemplate.initialPrompt ?? undefined,
              systemPrompt: promptTemplate.systemPrompt ?? undefined,
              attachedFunctions: promptTemplate.attachedFunctions,
              resultSchema: promptTemplate.resultSchema
                ? promptTemplate.resultSchema
                : undefined,
              inputSchema: promptTemplate.inputSchema
                ? promptTemplate.inputSchema
                : undefined,
            }}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      <div className="lg:col-span-1">
        {metrics ? (
          <>
            <PromptMetricsCharts metrics={metrics} />
            <div className="h-8" />
            <JobMetricsCharts metrics={metrics} />
          </>
        ) : (
          <p>Loading metrics...</p>
        )}
      </div>
    </div>
  );
}
