import { cn } from "@/lib/utils";
import { formatRelative } from "date-fns";
import { Mail, Slack, User } from "lucide-react";
import { MessageContainerProps } from "./workflow-event";
import { z } from "zod";

const displayableMeta = z
  .object({
    displayable: z
      .object({
        via: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export function HumanMessage({
  data,
  pending,
  createdAt,
  metadata,
}: MessageContainerProps<"human">) {

  const parsed = displayableMeta.safeParse(metadata);

  const via = parsed.success ? parsed.data?.displayable?.via : "playground";

  return (
    <div className="mx-4">
      <div
        className={cn(
          `rounded-xl bg-primary p-4 shadow-sm hover:shadow-md transition-all duration-200`,
          pending ? `opacity-70` : ``
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-primary-foreground/20">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary-foreground/10 flex items-center justify-center">
              <div className="text-primary-foreground font-medium">
                {(() => {
                  switch (via) {
                    case "slack":
                      return <Slack />;
                    case "email":
                      return <Mail />;
                    case "playground":
                      return <User />;
                    default:
                      return null;
                  }
                })()}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-primary-foreground">
                Human <span className="text-muted-foreground">via {via}</span>
              </div>
              <div className="text-xs text-primary-foreground/70">
                {createdAt ? formatRelative(createdAt, new Date()) : "unknown"}
              </div>
            </div>
          </div>
        </div>

        <div className="text-sm text-primary-foreground whitespace-pre-line leading-relaxed bg-primary-foreground/5 rounded-md p-3">
          {data.message}
        </div>
      </div>
    </div>
  );
}
