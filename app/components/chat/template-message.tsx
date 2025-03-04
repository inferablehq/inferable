import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatRelative } from "date-fns";
import { startCase } from "lodash";
import { ChevronDown } from "lucide-react";
import { MessageContainerProps } from "./run-event";
import { z } from "zod";

export function TemplateMessage({
  createdAt,
  metadata,
  data,
}: MessageContainerProps<"template"> & { runId: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {createdAt
              ? formatRelative(new Date(createdAt), new Date())
              : "unknown"}
          </div>
        </div>
      </div>
      {Object.entries({ ...data, ...metadata }).map(([key, value]) => (
        <CardContent className="flex flex-col" key={key}>
          {key === "message" ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center cursor-pointer">
                <p className="text-sm text-muted-foreground mr-2">
                  {startCase(key)}
                </p>
                <ChevronDown className="w-4 h-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="text-sm whitespace-pre-wrap mt-2">
                  {value as string}
                </p>
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
