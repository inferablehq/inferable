import { cn } from "@/lib/utils";
import { formatRelative } from "date-fns";
import { ChevronRightCircle, Mail, Slack } from "lucide-react";
import { MessageContainerProps } from "./run-event";
import { z } from "zod";
import { ReadOnlyJSON } from "../read-only-json";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

const displayableMeta = z
  .object({
    displayable: z
      .object({
        via: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const LARGE_MESSAGE_THRESHOLD = 5000;

export function HumanMessage({
  data,
  pending,
  createdAt,
  metadata,
}: MessageContainerProps<"human">) {
  const parsed = displayableMeta.safeParse(metadata);
  const via = parsed.data?.displayable?.via;

  let icon = <ChevronRightCircle className="w-5 h-5 text-primary-foreground" />;

  switch (via) {
    case "slack":
      icon = <Slack className="w-5 h-5 text-primary-foreground" />;
      break;
    case "email":
      icon = <Mail className="w-5 h-5 text-primary-foreground" />;
      break;
  }

  const isJsonMessage =
    typeof data.message === "object" ||
    (typeof data.message === "string" && data.message.includes("{")) ||
    data.message.includes("[");

  const isLargeMessage =
    (typeof data.message === "string" &&
      data.message.length > LARGE_MESSAGE_THRESHOLD) ||
    (typeof data.message === "object" &&
      JSON.stringify(data.message).length > LARGE_MESSAGE_THRESHOLD);

  const renderMessageContent = () =>
    isJsonMessage ? (
      <ReadOnlyJSON json={data.message} dark={true} />
    ) : (
      <div className="text-sm text-primary-foreground whitespace-pre-line leading-relaxed bg-primary-foreground/5 rounded-md p-3">
        {data.message}
      </div>
    );

  return (
    <div className="mx-4">
      <div
        className={cn(
          `rounded-xl bg-primary p-4 shadow-sm hover:shadow-md transition-all duration-200`,
          pending ? `opacity-70` : ``,
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-primary-foreground/20">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary-foreground/10 flex items-center justify-center">
              <div className="text-primary-foreground font-medium">{icon}</div>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <div className="text-sm font-medium text-primary-foreground">
                  Instructions
                </div>
                {via && (
                  <div className="text-xs text-primary-foreground/70">
                    (via {via})
                  </div>
                )}
              </div>
              <div className="text-xs text-primary-foreground/70">
                {createdAt ? formatRelative(createdAt, new Date()) : "unknown"}
              </div>
            </div>
          </div>
        </div>

        {isLargeMessage ? (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-primary-foreground mb-2">
              <ChevronDown className="h-4 w-4" />
              Show Message
            </CollapsibleTrigger>
            <CollapsibleContent>{renderMessageContent()}</CollapsibleContent>
          </Collapsible>
        ) : (
          renderMessageContent()
        )}
      </div>
    </div>
  );
}
