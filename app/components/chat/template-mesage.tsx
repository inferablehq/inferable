import { formatRelative } from "date-fns";
import { startCase } from "lodash";
import { ChevronDown, Bot } from "lucide-react";
import Link from "next/link";
import { ReadOnlyJSON } from "../read-only-json";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { MessageContainerProps } from "./workflow-event";
import { z } from "zod";

const displayableMeta = z.object({
  displayable: z.object({
    templateId: z.string().optional(),
    templateName: z.string().optional(),
  }).optional(),
}).passthrough();

export function TemplateMessage({
  createdAt,
  metadata,
  data,
  clusterId,
}: MessageContainerProps<"template">) {
  const parsed = displayableMeta.safeParse(metadata);

  let templateId;
  let templateName;
  if (parsed.success) {
    templateId = parsed.data?.displayable?.templateId;
    templateName = parsed.data?.displayable?.templateName;
  }

  return (
    <Card className="w-full rounded-none border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-sm font-semibold">
          <Bot className="w-5 h-5 mr-2" />
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
        </CardTitle>
      </CardHeader>
      {Object.entries({ ...data }).map(([key, value]) => (
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
