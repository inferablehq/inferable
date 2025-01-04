"use client";

import { client } from "@/client/client";
import { PromptTemplateForm } from "@/components/chat/prompt-template-form";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

export default function NewPromptTemplate({
  params,
}: {
  params: { clusterId: string };
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();
  const handleSubmit = async (formData: {
    name: string;
    initialPrompt?: string;
    systemPrompt?: string;
    attachedFunctions: string;
    resultSchema?: string;
    inputSchema?: string;
  }) => {
    setIsLoading(true);
    if (formData.name === "") {
      toast.error("Please enter a name for the Run Configuration");
      return;
    }

    try {
      const response = await client.createAgent({
        params: { clusterId: params.clusterId },
        body: {
          name: formData.name,
          initialPrompt:
            formData.initialPrompt === "" ? undefined : formData.initialPrompt,
          systemPrompt:
            formData.systemPrompt === "" ? undefined : formData.systemPrompt,
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

      if (response.status === 201) {
        toast.success("Run Configuration created successfully");
        router.push(
          `/clusters/${params.clusterId}/configs/${response.body.id}/edit`,
        );
      } else {
        createErrorToast(response, "Failed to create Run Configuration");
      }
    } catch (error) {
      toast.error(
        `An error occurred while creating the Run Configuration: ${error}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-xl">Create New Run Configuration</h1>
      <p className="text-muted-foreground mb-4">
        <br />
        Please see our{" "}
        <Link
          href="https://docs.inferable.ai/pages/run-configs"
          target="_blank"
          className="underline"
        >
          docs
        </Link>{" "}
        for more information
      </p>
      <PromptTemplateForm
        initialData={{
          name: "",
          initialPrompt: "",
          attachedFunctions: [],
        }}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
