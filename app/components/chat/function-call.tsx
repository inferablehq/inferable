import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  SmallDeadGrayCircle,
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
} from "@/components/circles";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { WorkflowJob } from "@/lib/types";
import { unpack } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { Code2, Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { JSONDisplay } from "../JSONDisplay";
import { Button } from "../ui/button";
import ToolContextButton from "./ToolContextButton";
import { formatRelative } from "date-fns";

const statusCircle = (status: WorkflowJob["status"], resultType: WorkflowJob["resultType"]) => {
  if (status === "pending") return <SmallLiveAmberCircle />;
  if (status === "success") {
    if (resultType === "rejection") return <SmallDeadRedCircle />;
    return <SmallDeadGreenCircle />;
  }
  if (status === "failure") return <SmallDeadRedCircle />;
  if (status === "stalled") return <SmallDeadGrayCircle />;
  if (status === "running") return <SmallLiveBlueCircle />;
};

const isShortJSON = (json: any) => {
  const str = JSON.stringify(json, null, 2);
  return str.length < 200 && str.split("\n").length < 5;
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
  const [editing, setEditing] = useState(false);
  const [job, setJob] = useState<Partial<ClientInferResponseBody<typeof contract.getJob>> | null>(
    null
  );
  const { getToken } = useAuth();

  const completedWithRejection = job?.resultType === "rejection" && job?.status === "success";

  useEffect(() => {
    onFocusChange(isExpanded);
  }, [isExpanded, onFocusChange]);

  useEffect(() => {
    setExpanded(isFocused);
    onFocusChange(isFocused);
  }, [isFocused, onFocusChange]);

  const getJobDetail = useCallback(async () => {
    const result = await client.getJob({
      params: { jobId, clusterId },
      headers: { authorization: `Bearer ${await getToken()}` },
    });
    if (result.status === 200) setJob(result.body);
    else setJob(null);
  }, [jobId, clusterId, getToken]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (editing) {
      getJobDetail();
      interval = setInterval(getJobDetail, 1000);
    }
    return () => interval && clearInterval(interval);
  }, [jobId, clusterId, getJobDetail, editing]);

  useEffect(() => {
    if (status === "success") getJobDetail();
  }, [status, getJobDetail]);

  const cancelJob = useCallback(async () => {
    const token = await getToken();
    const response = await client.cancelJob({
      params: { jobId, clusterId },
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 204) {
      getJobDetail();
    }
  }, [jobId, clusterId, getToken, getJobDetail]);

  const inputData = job?.targetArgs ? unpack(job.targetArgs) : null;
  const outputData = job?.result ? unpack(job.result) : null;
  const showInlineInput = inputData && isShortJSON(inputData);
  const showInlineOutput = outputData && isShortJSON(outputData);
  const showOutputPlaceholder =
    !showInlineOutput && status === "success" && !completedWithRejection;
  const showInputPlaceholder = !showInlineInput && inputData !== null;

  return (
    <div className="mr-2 ml-4">
      <Sheet open={editing} onOpenChange={setEditing}>
        <div className="rounded-lg border border-border/50 bg-background/50 p-4">
          <div className="space-y-2">
            <div className="flex flex-row items-center space-x-2">
              <SheetTrigger asChild>
                <Button
                  size="sm"
                  className={`${approvalRequested && !approved ? "opacity-50" : ""}
                             border bg-secondary/30 text-foreground hover:bg-secondary/50`}
                >
                  <div className="flex flex-row items-center text-sm">
                    <Code2 className="w-4 h-4 mr-2" />
                    <span className="font-mono mr-2">
                      {service}.{targetFn}()
                    </span>
                    {statusCircle(status, resultType)}
                  </div>
                </Button>
              </SheetTrigger>

              {approvalRequested && approved === null && (
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={() => submitApproval(true)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => submitApproval(false)}>
                    Deny
                  </Button>
                </div>
              )}

              {status === "pending" || status === "running" && !approvalRequested && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={cancelJob}
                  title="Cancel this function call"
                >
                  Cancel
                </Button>
              )}
            </div>

            {(showInlineInput ||
              showInlineOutput ||
              showInputPlaceholder ||
              showOutputPlaceholder ||
              completedWithRejection) && (
              <div className="ml-8 space-y-2">
                {showInlineInput && (
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground mb-1">Input</div>
                    <JSONDisplay json={inputData} />
                  </div>
                )}
                {showInputPlaceholder && (
                  <div className="bg-muted rounded-md p-2">
                    <div
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => setEditing(true)}
                    >
                      View input →
                    </div>
                  </div>
                )}
                {showInlineOutput && (
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground mb-1">Output</div>
                    <JSONDisplay json={outputData} />
                  </div>
                )}
                {showOutputPlaceholder && (
                  <div className="bg-muted rounded-md p-2">
                    <div
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => setEditing(true)}
                    >
                      View output →
                    </div>
                  </div>
                )}
                {completedWithRejection && (
                  <p className="text-sm text-muted-foreground">
                    Function executed but returned an error
                  </p>
                )}
              </div>
            )}

            <div className="ml-8 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                View full details →
              </Button>
              <ToolContextButton clusterId={clusterId} service={service} functionName={targetFn} />
            </div>
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
                  <Terminal className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">Function Details</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {job?.createdAt
                      ? formatRelative(new Date(job.createdAt), new Date())
                      : "Unknown"}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-2">
                    <Code2 size={16} className="text-primary/70" />
                    <span>Function Metadata</span>
                  </div>
                  <div className="ml-6 bg-muted rounded-md p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Status</div>
                      <div className="font-medium flex items-center gap-2">
                        <span className="font-mono">{job?.status || "Unknown"}</span>
                        {statusCircle(job?.status as WorkflowJob["status"], resultType)}
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
                    <Code2 size={16} className="text-primary/70" />
                    <span>Input Parameters</span>
                  </div>
                  <div className="ml-6 bg-muted rounded-md p-3">
                    {inputData ? (
                      <JSONDisplay json={inputData} />
                    ) : (
                      <p className="text-sm text-muted-foreground">No input data</p>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-2">
                    <Code2 size={16} className="text-primary/70" />
                    <span>Return Value</span>
                  </div>
                  <div className="ml-6 bg-muted rounded-md p-3">
                    {outputData ? (
                      <JSONDisplay json={outputData} />
                    ) : (
                      <p className="text-sm text-muted-foreground">Waiting...</p>
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
