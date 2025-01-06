import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  SmallDeadGrayCircle,
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
} from "@/components/circles";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WorkflowJob } from "@/lib/types";
import { unpack } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { Cpu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { JSONDisplay } from "../JSONDisplay";
import { Button } from "../ui/button";
import ToolContextButton from "./ToolContextButton";
import { formatRelative } from "date-fns";

const statusCircle = (
  status: WorkflowJob["status"],
  resultType: WorkflowJob["resultType"]
) => {
  if (status === "pending") {
    return <SmallLiveAmberCircle />;
  }
  if (status === "success") {
    if (resultType === "rejection") {
      return <SmallDeadRedCircle />;
    }

    return <SmallDeadGreenCircle />;
  }
  if (status === "failure") {
    return <SmallDeadRedCircle />;
  }
  if (status === "stalled") {
    return <SmallDeadGrayCircle />;
  }
  if (status === "running") {
    return <SmallLiveBlueCircle />;
  }
};

function FunctionCall({
  clusterId,
  jobId,
  isFocused,
  onFocusChange,
  service,
  resultType,
  status,
  targetFn,
  approved,
  approvalRequested,
  submitApproval,
}: {
  clusterId: string;
  jobId: string;
  isFocused: boolean;
  onFocusChange: (isFocused: boolean) => void;
  service: string;
  resultType: WorkflowJob["resultType"];
  status: WorkflowJob["status"];
  targetFn: string;
  approved: boolean | null;
  approvalRequested: boolean | null;
  submitApproval: (approved: boolean) => void;
}) {
  const [isExpanded, setExpanded] = useState(isFocused);

  useEffect(() => {
    onFocusChange(isExpanded);
  }, [isExpanded, onFocusChange, setExpanded]);

  useEffect(() => {
    setExpanded(isFocused);
    onFocusChange(isFocused);
  }, [isFocused, onFocusChange, setExpanded]);

  const [editing, setEditing] = useState(false);

  const [job, setJob] = useState<Partial<
    ClientInferResponseBody<typeof contract.getJob>
  > | null>(null);

  const completedWithRejection =
    job?.resultType === "rejection" && job?.status === "success";

  const { getToken } = useAuth();

  const getJobDetail = useCallback(async () => {
    const result = await client.getJob({
      params: {
        jobId,
        clusterId,
      },
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
    });

    if (result.status === 200) {
      setJob(result.body);
    } else {
      setJob(null);
    }
  }, [jobId, clusterId, getToken]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (editing) {
      getJobDetail();

      interval = setInterval(getJobDetail, 1000);
    }

    return () => {
      interval && clearInterval(interval);
    };
  }, [jobId, clusterId, getToken, getJobDetail, editing]);

  useEffect(() => {
    if (status === "success") {
      getJobDetail();
    }
  }, [status, getJobDetail]);

  return (
    <div className="mr-2 ml-4">
      <Sheet open={editing} onOpenChange={(o) => setEditing(o)}>
        <div>
          <div className="flex flex-row items-center space-x-2">
            <SheetTrigger>
              <Button
                size="sm"
                className={`${
                  approvalRequested && !approved ? "opacity-50" : ""
                } border bg-transparent border-gray-100 text-black hover:bg-gray-200`}
                asChild
              >
                <div className="flex flex-row items-center text-sm font-mono">
                  <Cpu className="w-4 h-4 mr-2" />
                  <span className="font-mono mr-2">
                    {service}.{targetFn}
                  </span>
                  <span className="">{statusCircle(status, resultType)}</span>
                </div>
              </Button>
            </SheetTrigger>
            <div className="flex items-center gap-2">
              <div
                className={approvalRequested && !approved ? "opacity-50" : ""}
              >
                <ToolContextButton
                  clusterId={clusterId}
                  service={service}
                  functionName={targetFn}
                />
              </div>
              {approvalRequested && approved === null && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => submitApproval(true)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => submitApproval(false)}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </div>
            {completedWithRejection && (
              <p className="text-sm text-muted-foreground">
                Inferable was able to run this tool, but it resulted in an
                error.
              </p>
            )}
          </div>
        </div>
        <SheetContent style={{ minWidth: 800 }} className="overflow-scroll">
          <SheetHeader>
            <SheetTitle>
              <span className="font-mono">
                {service}.{targetFn}()
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="h-4" />
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">Function Call</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {job?.createdAt
                      ? new Date(job.createdAt).toISOString()
                      : "Unknown"}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-2">
                    <Cpu size={16} className="text-primary/70" />
                    <span>Metadata</span>
                  </div>
                  <div className="ml-6 bg-muted rounded-md p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Status</div>
                      <div className="font-medium flex items-center gap-2">
                        <span className="font-mono">
                          {job?.status || "Unknown"}
                        </span>
                        {statusCircle(
                          job?.status as WorkflowJob["status"],
                          resultType
                        )}
                      </div>

                      <div className="text-muted-foreground">Machine ID</div>
                      <div className="font-medium font-mono">
                        {job?.executingMachineId || "Not assigned"}
                      </div>

                      <div className="text-muted-foreground">Created</div>
                      <div className="font-medium">
                        {job?.createdAt
                          ? formatRelative(new Date(job.createdAt), new Date())
                          : "Unknown"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-2">
                    <Cpu size={16} className="text-primary/70" />
                    <span>Input</span>
                  </div>
                  <div className="ml-6 bg-muted rounded-md p-3">
                    {job?.targetArgs ? (
                      <JSONDisplay json={unpack(job.targetArgs) || {}} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No input data
                      </p>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-2">
                    <Cpu size={16} className="text-primary/70" />
                    <span>Result</span>
                  </div>
                  <div className="ml-6 bg-muted rounded-md p-3">
                    {job?.result ? (
                      <JSONDisplay json={unpack(job.result) || {}} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Waiting...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default FunctionCall;
