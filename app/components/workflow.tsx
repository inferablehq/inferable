"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import FunctionCall from "@/components/chat/function-call";
import RunEvent from "@/components/chat/workflow-event";
import { Button } from "@/components/ui/button";
import { ClientInferResponseBody } from "@ts-rest/core";
import { FunctionSquareIcon, RefreshCcw, TestTube2Icon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { ulid } from "ulid";
import { Textarea } from "./ui/textarea";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useOrganization, useUser } from "@clerk/nextjs";
import { useQueue } from "@uidotdev/usehooks";
import { MessageCircleWarning } from "lucide-react";
import { FeedbackDialog } from "./bug-report-dialog";
import { DebugEvent } from "./debug-event";
import { ThinkingIndicator } from "./ThinkingIndicator";

import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "react-hot-toast";
import { Blob } from "./chat/blob";
import { ServerConnectionStatus } from "./server-connection-pane";

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

function ElementWrapper({
  mutableId,
  children,
  id,
}: {
  mutableId: string;
  children: React.ReactNode;
  id: string;
  human?: boolean;
}) {
  const dimmable = id.length === 26 && mutableId < id; // only if ULID

  return (
    <div
      className={`${
        dimmable ? `opacity-60` : ``
      } transition-all duration-300 workflow-element-wrapper mb-4`}
    >
      {children}
    </div>
  );
}

function smoothScrollToBottom(element: HTMLElement) {
  element.scrollTo({
    top: element.scrollHeight,
    behavior: "smooth",
  });
}

export function Run({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) {
  const router = useRouter();

  const goToRun = useCallback(
    (c: string, w?: string) => {
      router.push(`/clusters/${c}/runs/${w ?? ""}`);
    },
    [router]
  );

  const { getToken } = useAuth();

  const [prompt, setPrompt] = useState("");

  const [focusedJobId, setFocusedJobId] = useQueryState("jobId");

  const [runTimeline, setRunTimeline] = useState<ClientInferResponseBody<
    typeof contract.getRunTimeline,
    200
  > | null>(null);

  const fetchRunTimeline = useCallback(async () => {
    const result = await client.getRunTimeline({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId,
        runId,
      },
    });

    if (result.status === 200) {
      setRunTimeline(result.body);
      ServerConnectionStatus.addEvent({
        type: "getRunTimeline",
        success: true,
      });
    } else {
      ServerConnectionStatus.addEvent({
        type: "getRunTimeline",
        success: false,
      });
      if (result.status === 404) {
        goToRun(clusterId, "");
      }
    }
  }, [clusterId, runId, getToken, goToRun]);

  useEffect(() => {
    fetchRunTimeline();

    const timeout = setInterval(fetchRunTimeline, 2000);

    return () => {
      clearInterval(timeout);
    };
  }, [fetchRunTimeline]);

  const wipMessages = useQueue<
    ClientInferResponseBody<
      typeof contract.getRunTimeline,
      200
    >["messages"][number]
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
          type: "human",
          data: {
            message: inputPrompt,
          },
          pending: true,
          displayableContext: null,
        });
      }
    },
    [clusterId, runId, getToken, setPrompt, goToRun, wipMessages]
  );

  const submitApproval = useCallback(
    async ({
      approved,
      callId,
      clusterId,
    }: {
      approved: boolean;
      callId: string;
      clusterId: string;
    }) => {
      if (!clusterId || !callId) {
        return;
      }

      const result = await client.createCallApproval({
        body: {
          approved,
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
          callId,
        },
      });

      if (result.status !== 204) {
        createErrorToast(result, "Failed to approve call");
      }
    },
    [getToken]
  );

  const [mutableId, setMutableId] = useState("7ZZZZZZZZZZZZZZZZZZZZZZZZZ");

  const user = useUser();
  const organization = useOrganization();

  const role = user.user?.organizationMemberships.find(
    (o) => o.organization.id === organization?.organization?.id
  )?.role;

  const isAdmin = role === "org:admin";

  const isOwner = runTimeline?.run.userId === user.user?.id;

  const jobElements =
    runTimeline?.jobs.map((job) => ({
      element: (
        <ElementWrapper mutableId={mutableId} id={job.id} key={job.id}>
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
                callId: job.id,
                clusterId,
              });
            }}
            onFocusChange={(focused) => {
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
    runTimeline?.messages.map((m) => ({
      element: (
        <ElementWrapper
          mutableId={mutableId}
          id={m.id}
          key={m.id}
          human={m.type === "human"}
        >
          <RunEvent
            key={m.id}
            id={m.id}
            isEditable={isAdmin || isOwner}
            createdAt={m.createdAt}
            data={m.data}
            displayableContext={m.displayableContext ?? undefined}
            type={m.type}
            showMeta={false}
            clusterId={clusterId}
            jobs={runTimeline?.jobs ?? []}
            pending={"pending" in m && m.pending}
            runId={runId}
            onPreMutation={(ulid) => setMutableId(ulid)}
          />
        </ElementWrapper>
      ),
      timestamp: new Date(m.createdAt).getTime(),
    })) || [];

  const blobElements =
    runTimeline?.blobs.map((a) => ({
      element: (
        <ElementWrapper id={a.id} key={a.id} mutableId={mutableId}>
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
          <ElementWrapper id={a.id} key={a.id} mutableId={mutableId}>
            <DebugEvent
              clusterId={clusterId}
              event={a}
              msSincePreviousEvent={
                index > 0
                  ? new Date(a.createdAt).getTime() -
                    new Date(
                      runTimeline?.activity[index - 1]?.createdAt ?? 0
                    ).getTime()
                  : 0
              }
            />
          </ElementWrapper>
        ),
        timestamp: new Date(a.createdAt).getTime(),
      })) || [];

  const testHeader =
    runTimeline?.run.test === true
      ? {
          element: (
            <div className="bg-white border-b shadow-lg">
              <Alert variant="default" className="bg-white border-0">
                <TestTube2Icon className="h-4 w-4" />
                <AlertTitle>Test Run</AlertTitle>
                <AlertDescription>
                  This run was part of a test.
                </AlertDescription>
              </Alert>
            </div>
          ),
          timestamp: 0,
        }
      : null;

  const availableToolsHeader =
    runTimeline?.run.attachedFunctions &&
    runTimeline?.run.attachedFunctions.length > 0
      ? {
          element: (
            <div className="bg-white border-b shadow-lg">
              <Alert variant="default" className="bg-white border-0">
                <FunctionSquareIcon className="h-4 w-4" />
                <AlertTitle>Available Functions</AlertTitle>
                <AlertDescription>
                  This run is limited to calling the following functions:
                </AlertDescription>
                {runTimeline?.run.attachedFunctions.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
              </Alert>
            </div>
          ),
          timestamp: 0,
        }
      : {
          element: (
            <div className="bg-white border-b shadow-lg">
              <Alert variant="default" className="bg-white border-0">
                <FunctionSquareIcon className="h-4 w-4" />
                <AlertTitle>Available Tools</AlertTitle>
                <AlertDescription>
                  This run has access to all functions (Including the{" "}
                  <a
                    className="underline"
                    href="https://docs.inferable.ai/pages/standard-lib"
                  >
                    Standard Library
                  </a>
                  ).
                </AlertDescription>
              </Alert>
            </div>
          ),
          timestamp: 0,
        };

  const failedHeader =
    runTimeline?.run.status === "failed"
      ? {
          element: (
            <div className="bg-white border-b shadow-lg">
              <Alert variant="destructive" className="bg-white border-0">
                <MessageCircleWarning className="h-4 w-4" />
                <AlertTitle>Run Failed</AlertTitle>
                <AlertDescription>
                  <p>The run failed with the following message.</p>
                  <p>
                    If the problem persists, please contact support at
                    support@inferable.ai.
                  </p>
                  <pre className="text-red-500 my-2">
                    {JSON.stringify(
                      runTimeline?.run.failureReason ?? "Unknown failure",
                      null,
                      2
                    )}
                  </pre>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const loading = toast.loading("Retrying run...");
                      await client
                        .createRunRetry({
                          headers: {
                            authorization: `Bearer ${await getToken()}`,
                          },
                          params: {
                            clusterId,
                            runId,
                          },
                          body: {
                            messageId: runTimeline?.messages[0].id,
                          },
                        })
                        .then(() => {
                          toast.success("Run retried", {
                            id: loading,
                          });
                        })
                        .catch((e) => {
                          createErrorToast(e, "Failed to retry run");
                        })
                        .finally(() => {
                          toast.remove(loading);
                        });
                    }}
                  >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ),
          timestamp: 0,
        }
      : null;

  const pendingMessage =
    wipMessages.queue
      .filter((m) => !runTimeline?.messages.map((m) => m.id).includes(m.id))
      .map((m) => ({
        element: (
          <ElementWrapper
            mutableId={mutableId}
            id={m.id}
            key={m.id}
            human={m.type === "human"}
          >
            <RunEvent
              key={m.id}
              id={m.id}
              isEditable={isAdmin || isOwner}
              createdAt={m.createdAt}
              data={m.data}
              displayableContext={m.displayableContext ?? undefined}
              type={m.type}
              showMeta={false}
              clusterId={clusterId}
              jobs={runTimeline?.jobs ?? []}
              pending={"pending" in m && m.pending}
              runId={runId}
              onPreMutation={(ulid) => setMutableId(ulid)}
            />
          </ElementWrapper>
        ),
        timestamp: new Date(m.createdAt).getTime(),
      })) || [];

  const elements = [
    failedHeader,
    testHeader,
    availableToolsHeader,
    ...jobElements,
    ...eventElements,
    ...activityElements,
    ...pendingMessage,
    ...blobElements,
  ]
    .filter(Boolean)
    .sort((a, b) => (a!.timestamp > b!.timestamp ? 1 : -1))
    .map((item) => item!.element);

  const isEditable = isAdmin || isOwner;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      smoothScrollToBottom(container);
    }
  }, [elements.length]);

  return (
    <div className="h-[calc(100vh-16rem)] overflow-hidden rounded-sm">
      <div
        ref={scrollContainerRef}
        className="h-[calc(100vh-25rem)] border rounded-sm text-sm overflow-y-auto scroll-smooth"
      >
        {elements.length > 0 ? (
          <div className="flex flex-col">{elements}</div>
        ) : (
          messageSkeleton
        )}
      </div>
      <div ref={messagesEndRef} />
      <div className="flex flex-col space-y-2 p-2 bg-slate-50 border">
        {!!runTimeline && isEditable ? (
          <div className="flex flex-col space-y-2">
            <Textarea
              rows={3}
              placeholder={"Message Inferable"}
              className="focus-visible:ring-offset-0"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(prompt);
                }
              }}
            />
            <div className="flex flex-row space-x-2">
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => onSubmit(prompt)}
                  size="sm"
                  disabled={runTimeline?.run.status === "running"}
                >
                  {runTimeline?.run.status === "running" ? (
                    <>
                      <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
              <div className="flex-grow">&nbsp;</div>
              <FeedbackDialog
                runId={runId}
                clusterId={clusterId}
                comment={runTimeline?.run.feedbackComment}
                score={runTimeline?.run.feedbackScore}
                userName={
                  user.user?.emailAddresses.find((e) => e.emailAddress)
                    ?.emailAddress ?? ""
                }
              />
            </div>
          </div>
        ) : (
          !!runTimeline && (
            <div>
              <p className="text-gray-500 text-center">
                You are not the owner of this workflow.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
