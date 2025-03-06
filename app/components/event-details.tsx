import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ReadOnlyJSON } from "@/components/read-only-json";
import { Button } from "@/components/ui/button";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatRelative } from "date-fns";
import { startCase } from "lodash";
import { Info, Blocks } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const sanitizedKey: { [key: string]: string } = {
  targetFn: "Function",
  workflowId: "Run ID",
  clusterId: "Cluster ID",
};

const formatDateTime = (date: string | Date) =>
  new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function EventDetails({
  eventId,
  clusterId,
  isOpen,
  onOpenChange,
}: {
  eventId: string | null;
  clusterId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [eventMeta, setEventMeta] = useState<ClientInferResponseBody<
    typeof contract.getEventMeta,
    200
  > | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();

  const fetchEventMeta = useCallback(async () => {
    if (!eventId || !clusterId) return;

    setIsLoading(true);
    try {
      const response = await client.getEventMeta({
        params: { clusterId, eventId },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        setEventMeta(response.body);
      } else {
        createErrorToast(response, "Failed to fetch event metadata");
      }
    } catch (error) {
      createErrorToast(error, "Error fetching event metadata");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, clusterId, getToken]);

  useEffect(() => {
    if (isOpen && eventId) {
      fetchEventMeta();
    }
  }, [isOpen, eventId, fetchEventMeta]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ minWidth: "60%" }}
        className="overflow-y-auto h-screen bg-white"
      >
        <SheetHeader>
          <SheetTitle>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Info className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="font-mono">Event Details</div>
                <div className="text-xs text-muted-foreground">
                  {eventMeta?.createdAt
                    ? formatRelative(new Date(eventMeta.createdAt), new Date())
                    : "Loading..."}
                </div>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-sm text-muted-foreground">
                Loading event details...
              </p>
            </div>
          ) : (
            eventMeta && (
              <>
                <div className="rounded-xl bg-white p-4 shadow-sm border border-border/50 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <Info className="w-3 h-3 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Event Details</div>
                      <div className="text-xs text-muted-foreground">
                        Event ID: {eventMeta.id}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(eventMeta)
                      .filter(([key]) => key !== "meta")
                      .map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <dt className="text-xs font-medium text-muted-foreground">
                            {sanitizedKey[key] ?? startCase(key)}
                          </dt>
                          <dd className="text-sm">
                            {value instanceof Date
                              ? formatDateTime(value)
                              : value === null
                                ? "—"
                                : typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value)}
                          </dd>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <Blocks className="w-3 h-3 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Metadata</div>
                      <div className="text-xs text-muted-foreground">
                        Additional event information
                      </div>
                    </div>
                  </div>
                  {eventMeta.meta ? (
                    <ReadOnlyJSON json={eventMeta.meta} />
                  ) : (
                    <div className="flex items-center justify-center h-24">
                      <p className="text-sm text-muted-foreground">
                        No metadata available
                      </p>
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
