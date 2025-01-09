import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ClientInferResponseBody } from "@ts-rest/core";
import { memo } from "react";
import { ReadOnlyJSON } from "../read-only-json";
import ReactMarkdown from "react-markdown";
import "./markdown.css";
import { get } from "lodash";
import { ClipboardCopy, ShieldCheck, ShieldAlert } from "lucide-react";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  content: string;
  className?: string;
  messages: ClientInferResponseBody<typeof contract.listMessages, 200>;
}

// Create the base component
const MarkdownBase = ({ content, className, messages }: MarkdownProps) => {
  return (
    <>
      <ReactMarkdown
        className={cn("markdown-content", className)}
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => {
            if (href && /^[0-9A-Z]{26}\./.test(href)) {
              const path = decodeURIComponent(href);
              const [id] = path.split(".");
              const resultPath = path;
              const message = messages?.find(
                m => m.type === "invocation-result" && get(m, "data.id") === id
              );

              const invocationResult = get(message, "data.result", {
                error: "No result found",
              });

              const value = resultPath
                ? get(invocationResult, resultPath, "Error getting value")
                : invocationResult;

              let isValueModified = true;

              if (typeof value === "string") {
                isValueModified = children !== value;
              } else if (typeof value === "object") {
                isValueModified = children !== JSON.stringify(value);
              } else if (typeof value === "number") {
                isValueModified = children !== value.toString();
              } else if (typeof value === "boolean") {
                isValueModified = children !== value.toString();
              } else if (typeof value === "undefined") {
                isValueModified = children !== "undefined";
              } else if (value === null) {
                isValueModified = children !== "null";
              } else {
                isValueModified = children !== value;
              }

              if (isValueModified) {
                console.log({
                  children,
                  actual: get(invocationResult, resultPath),
                });
              }

              return (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="link"
                      className="p-0 h-auto font-normal text-blue-500 hover:text-blue-700 underline"
                    >
                      {children}
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    style={{ minWidth: 800 }}
                    className="overflow-y-auto h-screen"
                  >
                    <SheetHeader className="pb-6">
                      <SheetTitle>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <ClipboardCopy className="w-5 h-5 text-primary" />
                          </div>
                          <div className="">
                            <div className="font-mono text-xl">Reference Details</div>
                            <div className="text-sm text-muted-foreground">
                              View the referenced data and its context
                            </div>
                          </div>
                        </div>
                      </SheetTitle>
                    </SheetHeader>

                    <div
                      className={cn(
                        "flex flex-col gap-2 px-4 py-3 border rounded-lg mb-6",
                        isValueModified
                          ? "bg-blue-50 border-blue-100"
                          : "bg-green-50 border-green-100"
                      )}
                    >
                      {isValueModified ? (
                        <>
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <p className="text-sm text-blue-700">
                              This value has been modified in translation.
                            </p>
                          </div>
                          <div className="pl-6 space-y-1.5">
                            <div className="text-xs text-blue-600 flex items-baseline">
                              <span className="font-medium w-20">Displayed:</span>
                              <span className="font-mono">{JSON.stringify(children)}</span>
                              <span className="text-blue-400 ml-2">
                                ({typeof children === "object" ? "object" : typeof children})
                              </span>
                            </div>
                            <div className="text-xs text-blue-600 flex items-baseline">
                              <span className="font-medium w-20">Actual:</span>
                              <span className="font-mono">
                                {JSON.stringify(get(invocationResult, resultPath))}
                              </span>
                              <span className="text-blue-400 ml-2">
                                (
                                {typeof get(invocationResult, resultPath) === "object"
                                  ? "object"
                                  : typeof get(invocationResult, resultPath)}
                                )
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <p className="text-sm text-green-700">
                            Inferable has verified that this value was referenced from a tool result
                            by the model, without any tampering.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-xl p-5 shadow-sm border bg-white/50 border-gray-200 transition-all duration-200">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
                          <div>
                            <h3 className="text-sm font-medium">Path</h3>
                            <p className="text-sm font-mono mt-2 text-muted-foreground">{path}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-medium">Value</h3>
                            <p className="text-sm font-mono mt-2 bg-secondary/40 p-2 rounded-md overflow-auto">
                              {JSON.stringify(value, null, 2)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl p-5 shadow-sm border bg-white/50 border-gray-200 transition-all duration-200">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
                          <div>
                            <h3 className="text-sm font-medium">Source Data</h3>
                          </div>
                        </div>
                        <div className="mt-2 overflow-hidden rounded-lg">
                          <ReadOnlyJSON json={invocationResult} />
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              );
            }
            return (
              <a href={href} className="text-blue-500 hover:text-blue-700 underline">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </>
  );
};

// Export the memoized version
export const Markdown = memo(MarkdownBase, (prevProps, nextProps) => {
  return (
    prevProps.content === nextProps.content &&
    prevProps.messages.length === nextProps.messages.length
  );
});
