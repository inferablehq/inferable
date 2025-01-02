import { messageDataSchema } from "@/client/contract";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRelative } from "date-fns";
import { startCase } from "lodash";
import { ChevronDown } from "lucide-react";
import { MessageContainerProps } from "./workflow-event";
import { z } from "zod";

type TemplateMessageData = z.infer<typeof messageDataSchema> & {
  type: "template";
  message: string;
};

export function TemplateMessage({
  createdAt,
  displayableContext,
  data,
  clusterId,
  id: messageId,
  runId,
}: MessageContainerProps & { runId: string }) {
  const parsedData = messageDataSchema.parse(data) as TemplateMessageData;

  return (
    <Card>
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {formatRelative(new Date(createdAt), new Date())}
          </div>
        </div>
      </div>
      {Object.entries({ ...parsedData, ...displayableContext }).map(([key, value]) => (
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
                <pre className="text-sm whitespace-pre-wrap bg-muted p-2 rounded-md">
                  {JSON.stringify(value, null, 2)}
                </pre>
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
