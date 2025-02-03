"use client";

import { client, clientWithAbortController } from "@/client/client";
import { contract } from "@/client/contract";
import FunctionCall from "@/components/chat/function-call";
import RunEvent from "@/components/chat/workflow-event";
import { Button } from "@/components/ui/button";
import { ClientInferResponseBody } from "@ts-rest/core";
import { RefreshCcw, TestTube2Icon, WorkflowIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";

import { ulid } from "ulid";
import { Textarea } from "./ui/textarea";

import { cn, createErrorToast } from "@/lib/utils";
import { useAuth, useOrganization, useUser } from "@clerk/nextjs";
import { useQueue } from "@uidotdev/usehooks";
import { MessageCircleWarning } from "lucide-react";
import { FeedbackDialog } from "./bug-report-dialog";
import { DebugEvent } from "./debug-event";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendButton } from "@/components/ui/send-button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Blob } from "./chat/blob";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const messageSkeleton = (
  <div className="flex flex-col items-start space-y-4 p-4" key="skeleton-0">
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-8 w-[80%]" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-8 w-full" />
  </div>
);

function uniqueBy<T>(array: T[], key: keyof T) {
  return array.filter((v, i, a) => a.findIndex(t => t[key] === v[key]) === i);
}

function ElementWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className={`transition-all duration-300 workflow-element-wrapper mb-4`}>{children}</div>
  );
}

function smoothScrollToBottom(element: HTMLElement) {
  element.scrollTo({
    top: element.scrollHeight,
    behavior: "smooth",
  });
}

export function Run({ clusterId, runId }: { clusterId: string; runId: string }) {
  const { getToken } = useAuth();

  const [prompt, setPrompt] = useState("");

  const [focusedJobId, setFocusedJobId] = useQueryState("jobId");

  const [runTimeline, setRunTimeline] = useState<ClientInferResponseBody<
    typeof contract.getRunTimeline,
    200
  > | null>(null);

  const messagesAfter = useRef<string>("0");
  const activityAfter = useRef<string>("0");
  const isMounted = useRef<boolean>(true);
  const controllerRef = useRef<AbortController>();

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchRunTimeline = useCallback(async () => {
    if (!isMounted.current) return;

    // Abort previous request if it exists
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const result = await clientWithAbortController(controller.signal)
      .getRunTimeline({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
          runId,
        },
        query: {
          messagesAfter: messagesAfter.current,
          activityAfter: activityAfter.current,
        },
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") {
          // Request was aborted, do nothing
          return {
            status: -1,
            body: null,
          } as const;
        }
        console.error("Failed to fetch timeline", e);

        return {
          status: 503,
          body: null,
        } as const;
      });

    if (!isMounted.current || result.status === -1) return;

    if (result.status === 200) {
      if (result.body.messages.length === 0 && result.body.activity.length === 0) {
        console.debug("No new messages or activity");
        await new Promise(resolve => setTimeout(resolve, 2_000));
      } else {
        setRunTimeline(t => {
          const newTimeline = {
            ...t,
            blobs: uniqueBy(result.body.blobs.concat(t?.blobs ?? []), "id"),
            messages: uniqueBy(result.body.messages.concat(t?.messages ?? []), "id"),
            activity: uniqueBy(result.body.activity.concat(t?.activity ?? []), "id"),
            jobs: uniqueBy(result.body.jobs.concat(t?.jobs ?? []), "id"),
            run: result.body.run ?? t?.run,
          };

          return newTimeline;
        });

        const maxMessageId = result.body.messages.sort((a, b) => b.id.localeCompare(a.id))[0]?.id;
        const maxActivityId = result.body.activity.sort((a, b) => b.id.localeCompare(a.id))[0]?.id;

        if (maxMessageId) {
          messagesAfter.current = maxMessageId;
        }

        if (maxActivityId) {
          activityAfter.current = maxActivityId;
        }
      }
    } else {
      createErrorToast(result, "Failed to fetch timeline. Will wait for a bit and retry...");
      await new Promise(resolve => setTimeout(resolve, 4_000));
    }

    if (isMounted.current) {
      setTimeout(fetchRunTimeline, 1000);
    }
  }, [clusterId, runId]);

  useEffect(() => {
    isMounted.current = true;
    fetchRunTimeline();

    return () => {
      isMounted.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchRunTimeline]);

  const wipMessages = useQueue<
    ClientInferResponseBody<typeof contract.getRunTimeline, 200>["messages"][number]
  >([]);

  const onSubmit = useCallback(
    async (inputPrompt: string) => {
      if (!inputPrompt || !runId) {
        return;
      }
      if (!clusterId) {
        return;
      }

      setPrompt("");

      const id = ulid();

      const result = await client.createMessage({
        body: {
          id,
          message: inputPrompt,
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
          runId,
        },
      });

      if (result.status !== 201) {
        createErrorToast(result, "Failed to add message to run");
        setPrompt(inputPrompt);
      } else {
        wipMessages.add({
          id,
          createdAt: new Date(),
          data: {
            message: inputPrompt,
          },
          pending: true,
          metadata: null,
          type: "human",
        });
      }
    },
    [clusterId, runId, getToken, setPrompt, wipMessages]
  );

  const submitApproval = useCallback(
    async ({
      approved,
      jobId,
      clusterId,
    }: {
      approved: boolean;
      jobId: string;
      clusterId: string;
    }) => {
      if (!clusterId || !jobId) {
        return;
      }

      const result = await client.createJobApproval({
        body: {
          approved,
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
          jobId,
        },
      });

      if (result.status !== 204) {
        createErrorToast(result, "Failed to approve call");
      }
    },
    [getToken]
  );

  const user = useUser();
  const organization = useOrganization();

  const role = user.user?.organizationMemberships.find(
    o => o.organization.id === organization?.organization?.id
  )?.role;

  const isAdmin = role === "org:admin";

  const isOwner = runTimeline?.run.userId === user.user?.id;

  const router = useRouter();

  const elements = useMemo(() => {
    const jobElements =
      runTimeline?.jobs.map(job => ({
        element: (
          <ElementWrapper key={job.id}>
            <FunctionCall
              key={job.id}
              clusterId={clusterId}
              jobId={job.id}
              service={job.service}
              resultType={job.resultType}
              status={job.status}
              targetFn={job.targetFn}
              approved={job.approved}
              approvalRequested={job.approvalRequested}
              isFocused={focusedJobId === job.id}
              submitApproval={(approved: boolean) => {
                submitApproval({
                  approved,
                  jobId: job.id,
                  clusterId,
                });
              }}
              onFocusChange={focused => {
                if (!focused && focusedJobId !== job.id) {
                  return;
                }
                setFocusedJobId(focused ? job.id : null);
              }}
            />
          </ElementWrapper>
        ),
        timestamp: new Date(job.createdAt).getTime(),
      })) || [];

    const eventElements =
      runTimeline?.messages
        .filter(m => ["human", "agent", "template", "invocation-result"].includes(m.type))
        .map(m => ({
          element: (
            <ElementWrapper key={m.id}>
              <RunEvent
                {...m}
                key={m.id}
                showMeta={false}
                clusterId={clusterId}
                jobs={runTimeline?.jobs ?? []}
                pending={"pending" in m && m.pending}
                runId={runId}
                messages={runTimeline?.messages ?? []}
              />
            </ElementWrapper>
          ),
          timestamp: m.createdAt ? new Date(m.createdAt).getTime() : 0,
        })) || [];

    const blobElements =
      runTimeline?.blobs.map(a => ({
        element: (
          <ElementWrapper key={a.id}>
            <Blob blob={a} clusterId={clusterId} key={a.id} />
          </ElementWrapper>
        ),
        timestamp: new Date(a.createdAt).getTime(),
      })) || [];

    const activityElements =
      runTimeline?.activity
        .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
        .map((a, index) => ({
          element: (
            <ElementWrapper key={a.id}>
              <DebugEvent
                clusterId={clusterId}
                event={a}
                msSincePreviousEvent={
                  index > 0
                    ? new Date(a.createdAt).getTime() -
                      new Date(runTimeline?.activity[index - 1]?.createdAt ?? 0).getTime()
                    : 0
                }
              />
            </ElementWrapper>
          ),
          timestamp: new Date(a.createdAt).getTime(),
        })) || [];

    const metadataOptionsHeader = runTimeline?.run
      ? {
          element: (
            <div className="bg-white border-b px-4 py-2 mb-4" key="metadata-options-header">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  {runTimeline?.run.test ? (
                    <div className="bg-purple-50 p-2 rounded">
                      <TestTube2Icon className="h-4 w-4 text-purple-500" />
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-2 rounded">
                      <WorkflowIcon className="h-4 w-4 text-blue-500" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {runTimeline?.run.test ? "Test Run" : "Run"}
                    </span>
                    <p className="text-xs text-gray-400">{runTimeline?.run.id}</p>
                  </div>
                </div>
                {/* {runTimeline?.run.tags && Object.keys(runTimeline?.run.tags).length > 0 && (
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-medium text-gray-500">Tags</span>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(runTimeline?.run.tags).map(([key, value]) => (
                        <div
                          key={key}
                          className="bg-gray-100 px-2 py-0.5 rounded text-xs"
                          title={`${key}: ${value}`}
                        >
                          {key}: {value}
                        </div>
                      ))}
                    </div>
                  </div>
                )} */}
                {runTimeline?.run.systemPrompt && (
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-medium text-gray-500">System Prompt</span>
                    <div className="flex flex-wrap gap-1">
                      <div className="py-0.5 rounded text-xs text-gray-500">
                        {runTimeline?.run.systemPrompt}
                      </div>
                    </div>
                  </div>
                )}
                {runTimeline?.run.context && Object.keys(runTimeline?.run.context).length > 0 && (
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-medium text-gray-500">Context</span>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(runTimeline?.run.context).map(([key, value]) => {
                        const displayValue =
                          typeof value === "string" && value.length > 50
                            ? value.slice(0, 47) + "..."
                            : JSON.stringify(value);
                        return (
                          <div
                            key={key}
                            className="bg-gray-100 px-2 py-0.5 rounded text-xs"
                            title={`${key}: ${JSON.stringify(value)}`}
                          >
                            {key}: {displayValue}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {runTimeline?.run.attachedFunctions &&
                runTimeline?.run.attachedFunctions.length > 0 ? (
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-medium text-gray-500">Functions</span>
                    <div className="flex flex-wrap gap-1">
                      {runTimeline?.run.attachedFunctions.map(fn => (
                        <div
                          key={fn}
                          className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono"
                          title={fn}
                        >
                          {fn}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-medium text-gray-500">Functions</span>
                    <div className="flex flex-wrap gap-1">
                      <div className="py-0.5 rounded text-xs text-gray-500">
                        Full access including{" "}
                        <a
                          className="text-blue-500 hover:underline"
                          href="https://docs.inferable.ai/pages/standard-lib"
                        >
                          Standard Library
                        </a>
                      </div>
                    </div>
                  </div>
                )}
                {runTimeline?.run.userId && (
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-medium text-gray-500">User</span>
                    <div className="flex flex-wrap gap-1">
                      <div
                        className="bg-gray-100 px-2 py-0.5 rounded text-xs"
                        title={`Id: ${runTimeline?.run.userId}`}
                      >
                        Id: <span className="font-mono">{runTimeline?.run.userId}</span>
                      </div>
                    </div>
                  </div>
                )}
                {runTimeline?.run.status === "failed" && (
                  <div className="flex flex-row">
                    <MessageCircleWarning className="h-4 w-4 mt-1 text-red-500" />
                    <span className="text-sm text-red-600 px-2">
                      Failed: {runTimeline?.run.failureReason}
                    </span>{" "}
                  </div>
                )}
              </div>
            </div>
          ),
          timestamp: 0,
        }
      : null;

    const pendingMessage =
      wipMessages.queue
        .filter(m => !runTimeline?.messages.map(m => m.id).includes(m.id))
        .map(m => ({
          element: (
            <ElementWrapper key={m.id}>
              <RunEvent
                {...m}
                key={m.id}
                showMeta={false}
                clusterId={clusterId}
                jobs={runTimeline?.jobs ?? []}
                pending={"pending" in m && m.pending}
                runId={runId}
                messages={runTimeline?.messages ?? []}
              />
            </ElementWrapper>
          ),
          timestamp: m.createdAt ? new Date(m.createdAt).getTime() : new Date().getTime(),
        })) || [];

    return [
      metadataOptionsHeader,
      ...jobElements,
      ...eventElements,
      ...activityElements,
      ...pendingMessage,
      ...blobElements,
    ]
      .filter(Boolean)
      .sort((a, b) => (a!.timestamp > b!.timestamp ? 1 : -1))
      .map(item => item!.element);
  }, [runTimeline, clusterId, runId, focusedJobId, wipMessages.queue]);

  const isEditable = isAdmin || isOwner;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        smoothScrollToBottom(container);
      }
    }, 100); // add a small delay because inline elements are not rendered immediately
  }, [elements.length]);

  const composerDisabled = !runTimeline || !isEditable;

  return (
    <div className="overflow-hidden rounded-sm">
      <div
        ref={scrollContainerRef}
        className="h-[calc(100vh-25rem)] border rounded-sm text-sm overflow-y-auto scroll-smooth"
      >
        {elements.length > 0 ? <div className="flex flex-col">{elements}</div> : messageSkeleton}
      </div>
      <div
        className={cn(
          "flex flex-col space-y-2 p-2 bg-slate-50 border",
          composerDisabled ? "opacity-50 animate-pulse" : ""
        )}
      >
        <div className="flex flex-col space-y-2">
          <Textarea
            disabled={composerDisabled}
            rows={3}
            placeholder={"Message Inferable"}
            className="focus-visible:ring-offset-0"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit(prompt);
              }
            }}
          />
          <div className="flex flex-row space-x-2">
            <div className="flex items-center space-x-2">
              <SendButton
                onClick={() => onSubmit(prompt)}
                disabled={runTimeline?.run.status === "running"}
              >
                {runTimeline?.run.status === "running" ? (
                  <>
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Send"
                )}
              </SendButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1">
                    or via <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem asChild>
                    <a
                      href="https://docs.inferable.ai/pages/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      Run via API <ExternalLink className="h-3 w-3" />
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href="https://docs.inferable.ai/pages/slack"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      Run via Slack <ExternalLink className="h-3 w-3" />
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href="https://docs.inferable.ai/pages/email"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      Run via Email <ExternalLink className="h-3 w-3" />
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex-grow">&nbsp;</div>
            <Button
              variant="outline"
              onClick={async () => {
                const isOk = window.confirm(
                  "This will copy the initial prompt and run everything in a new run. Is that ok?"
                );

                if (!isOk) return;

                const creatingRun = toast.loading("Creating new run...");

                try {
                  const newRunId = ulid();

                  const existingRun = await client
                    .getRun({
                      params: {
                        clusterId,
                        runId,
                      },
                      headers: {
                        authorization: `Bearer ${await getToken()}`,
                      },
                    })
                    .then(r => {
                      if (r.status !== 200) {
                        createErrorToast(r, `Failed to get existing run of ${runId}`);
                        return null;
                      }

                      return r.body;
                    });

                  const firstMessage = await client
                    .getRunTimeline({
                      params: {
                        clusterId,
                        runId,
                      },
                      headers: {
                        authorization: `Bearer ${await getToken()}`,
                      },
                      query: {
                        messagesAfter: "0",
                      },
                    })
                    .then(r => {
                      if (r.status !== 200) {
                        createErrorToast(r, `Failed to get existing run of ${runId}`);
                        return null;
                      }

                      return r.body.messages.sort((a, b) => a.id.localeCompare(b.id))[0];
                    });

                  if (!firstMessage || !existingRun) {
                    toast.dismiss(creatingRun);
                    return;
                  }

                  const firstMessageText =
                    "message" in firstMessage?.data ? firstMessage.data?.message : "";

                  if (!firstMessageText) {
                    const digest = Date.now().toString();
                    toast.error(`Failed to get first message. digest=${digest}`);
                    console.error({
                      digest,
                      firstMessage,
                    });
                    toast.dismiss(creatingRun);
                    return;
                  }

                  await client
                    .createRun({
                      body: {
                        id: newRunId,
                        attachedFunctions: existingRun.attachedFunctions?.length
                          ? existingRun.attachedFunctions
                          : undefined,
                        tags: existingRun.tags ?? {},
                        context: existingRun.context ?? {},
                        initialPrompt: firstMessageText,
                        systemPrompt: existingRun.systemPrompt ?? undefined,
                        enableResultGrounding: existingRun.enableResultGrounding ?? false,
                        reasoningTraces: existingRun.reasoningTraces ?? false,
                        resultSchema: existingRun.resultSchema ?? undefined,
                        onStatusChange: existingRun.onStatusChange ?? undefined,
                        model: existingRun.model ?? undefined,
                        input: existingRun.input ?? undefined,
                        callSummarization: existingRun.callSummarization ?? undefined,
                        interactive: existingRun.interactive ?? undefined,
                      },
                      headers: {
                        authorization: `Bearer ${await getToken()}`,
                      },
                      params: {
                        clusterId,
                      },
                    })
                    .then(r => {
                      if (r.status !== 201) {
                        createErrorToast(r, `Failed to create new run of ${runId}`);
                        return;
                      }

                      router.push(`/clusters/${clusterId}/runs/${r.body.id}`);
                    });
                } catch (e) {
                  console.error(e);
                } finally {
                  toast.dismiss(creatingRun);
                }
              }}
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              Rerun
            </Button>
            <FeedbackDialog
              runId={runId}
              clusterId={clusterId}
              comment={runTimeline?.run.feedbackComment}
              score={runTimeline?.run.feedbackScore}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
