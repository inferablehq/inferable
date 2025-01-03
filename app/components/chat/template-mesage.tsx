import { formatRelative } from "date-fns";
import { startCase } from "lodash";
import { ChevronDown, Workflow, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ReadOnlyJSON } from "../read-only-json";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import { MessageContainerProps } from "./workflow-event";
import { client } from "../../client/client";
import { useAuth } from "@clerk/nextjs";

export function TemplateMessage({
  createdAt,
  displayableContext,
  data,
  clusterId,
  id: messageId,
  runId,
}: MessageContainerProps<"template">) {
  let templateId;
  let templateName;
  if (displayableContext && "templateId" in displayableContext) {
    templateId = displayableContext.templateId;
  }

  if (displayableContext && "templateName" in displayableContext) {
    templateName = displayableContext.templateName;
  }

  const [isRetrying, setIsRetrying] = useState(false);
  const { getToken } = useAuth();

  const handleRetry = async () => {
    if (window.confirm("Are you sure you want to retry? This will delete the current result.")) {
      setIsRetrying(true);
      try {
        const token = await getToken();
        const result = await client.createRunRetry({
          params: { clusterId, runId },
          body: { messageId },
          headers: { authorization: `Bearer ${token}` },
        });

        if (result.status === 204) {
          toast.success("Retry initiated");
        } else {
          throw new Error("Unexpected response status");
        }
      } catch (error) {
        console.error("Error retrying run:", error);
        toast.error("Retry failed");
      } finally {
        setIsRetrying(false);
      }
    }
  };

  return (
    <Card className="w-full rounded-none border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-sm font-semibold">
          <Workflow className="w-5 h-5 mr-2" />
          <div className="flex flex-row space-x-2">
            {templateId && templateName ? (
              <Link href={`/clusters/${clusterId}/prompts/${templateId}/edit`}>
                <div className="flex flex-row space-x-1">
                  <p className="text-muted-foreground font-normal">Triggered by</p>
                  <p>{templateName}</p>
                </div>
              </Link>
            ) : (
              <p>Prompt Template</p>
            )}
            <p className="text-muted-foreground font-normal">
              {createdAt ? formatRelative(createdAt, new Date()) : "unknown"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {isRetrying ? "Retrying..." : "Retry"}
          </Button>
        </CardTitle>
      </CardHeader>
      {Object.entries({ ...data, ...displayableContext }).map(([key, value]) => (
        <CardContent className="flex flex-col" key={key}>
          {key === "message" ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center cursor-pointer">
                <p className="text-sm text-muted-foreground mr-2">{startCase(key)}</p>
                <ChevronDown className="w-4 h-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="text-sm whitespace-pre-wrap mt-2">{value as string}</p>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{startCase(key)}</p>
              {typeof value === "object" ? (
                <ReadOnlyJSON json={value as object} />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{value as string}</p>
              )}
            </>
          )}
        </CardContent>
      ))}
    </Card>
  );
}
