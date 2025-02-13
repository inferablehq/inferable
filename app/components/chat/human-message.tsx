import { cn } from "@/lib/utils";
import { formatRelative } from "date-fns";
import { ChevronRightCircle } from "lucide-react";
import { MessageContainerProps } from "./run-event";
import { z } from "zod";
import { ReadOnlyJSON } from "../read-only-json";

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

  const isJsonMessage =
    typeof data.message === "object" ||
    (typeof data.message === "string" && data.message.includes("{")) ||
    data.message.includes("[");

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
                <ChevronRightCircle className="h-4 w-4" />
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-primary-foreground">Instructions</div>
              <div className="text-xs text-primary-foreground/70">
                {createdAt ? formatRelative(createdAt, new Date()) : "unknown"}
              </div>
            </div>
          </div>
        </div>
        {isJsonMessage ? (
          <ReadOnlyJSON json={data.message} dark={true} />
        ) : (
          <div className="text-sm text-primary-foreground whitespace-pre-line leading-relaxed bg-primary-foreground/5 rounded-md p-3">
            {data.message}
          </div>
        )}
      </div>
    </div>
  );
}
