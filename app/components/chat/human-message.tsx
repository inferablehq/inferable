import { client } from "@/client/client";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { formatRelative } from "date-fns";
import { Mail, PencilLineIcon, RefreshCcw, Slack, User } from "lucide-react";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
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
  clusterId,
  isEditable,
  runId,
  data,
  id: messageId,
  pending,
  createdAt,
  metadata,
}: MessageContainerProps<"human">) {
  const [editing, setEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(data.message);
  const { getToken } = useAuth();

  const parsed = displayableMeta.safeParse(metadata);

  const via = parsed.success ? parsed.data?.displayable?.via : "playground";

  const sendMessage = useCallback(async () => {
    if (!editedValue) return;

    await client
      .updateMessage({
        body: {
          message: editedValue,
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
          runId,
          messageId,
        },
      })
      .then(result => {
        if (result.status === 200) {
          toast.success("Success!");
        } else {
          createErrorToast(result, "Failed to update message");
        }
      })
      .catch(error => {
        createErrorToast(error, "Failed to update message");
      });
  }, [editedValue, clusterId, runId, messageId, getToken]);

  const updateMessage = useCallback(async () => {
    const id = toast.loading("Updating message...");

    await sendMessage();

    toast.dismiss(id);
  }, [sendMessage]);

  const retryMessage = useCallback(async () => {
    const id = toast.loading("Retrying message...");

    await sendMessage();

    toast.dismiss(id);
  }, [sendMessage]);

  const onSubmit = useCallback(async () => {
    if (editedValue === data.message) {
      setEditing(false);
      return;
    }

    updateMessage().then(() => {
      setEditing(false);
      setEditedValue(data.message);
    });
  }, [editedValue, data, updateMessage, setEditing]);

  if (editing) {
    return (
      <div className="mx-4 mb-4">
        <div className="rounded-xl bg-primary p-4 shadow-sm">
          <Textarea
            value={editedValue}
            onChange={e => setEditedValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground resize-none"
          />
          <div className="flex space-x-2 mt-3">
            <Button
              size="sm"
              variant="secondary"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
              onClick={onSubmit}
            >
              Done
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
              onClick={() => {
                setEditing(false);
                setEditedValue(data.message);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

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

          {isEditable && (
            <div className="flex space-x-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground transition-colors duration-200"
                onClick={() => setEditing(true)}
              >
                <PencilLineIcon className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">Edit</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
                onClick={retryMessage}
              >
                <RefreshCcw className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">Retry</span>
              </Button>
            </div>
          )}
        </div>

        <div className="text-sm text-primary-foreground whitespace-pre-line leading-relaxed bg-primary-foreground/5 rounded-md p-3">
          {data.message}
        </div>
      </div>
    </div>
  );
}
