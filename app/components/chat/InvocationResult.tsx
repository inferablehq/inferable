import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { get } from "lodash";
import { Blocks, Info } from "lucide-react";
import { useRef } from "react";
import { ReadOnlyJSON } from "../read-only-json";
import type { MessageContainerProps } from "./workflow-event";
import { formatRelative } from "date-fns";

export function InvocationResult(props: MessageContainerProps<"invocation-result">) {
  const componentRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="ml-8 relative group" ref={componentRef}>
        <div className="absolute left-1 w-[2px] -top-4 -bottom-4 bg-border/50" />

        <div className="flex items-start gap-4 relative">
          <div className="shrink-0 mt-2 w-2 h-2 rounded-full bg-gray-900 relative z-10 ring-4 ring-white" />

          <div className="flex-1">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2 group/header hover:bg-secondary/20 rounded-md px-2 py-1 -ml-2 transition-colors duration-200 w-full text-left"
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-700">Invocation Result</span>
                    <span className="text-muted-foreground font-mono">
                      {props.createdAt ? formatRelative(props.createdAt, new Date()) : "unknown"}
                    </span>
                  </div>
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                style={{ minWidth: "80%" }}
                className="overflow-y-auto h-screen bg-white"
              >
                <SheetHeader>
                  <SheetTitle>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Info className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-mono">Invocation Result</div>
                        <div className="text-xs text-muted-foreground">
                          {props.createdAt
                            ? formatRelative(props.createdAt, new Date())
                            : "unknown"}
                        </div>
                      </div>
                    </div>
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50">
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
                      <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                        <Blocks className="w-3 h-3 text-gray-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Result Data</div>
                        <div className="text-xs text-muted-foreground">
                          Function invocation details
                        </div>
                      </div>
                    </div>

                    <ReadOnlyJSON json={props.data} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </>
  );
}
