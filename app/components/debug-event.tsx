import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { startCase } from "lodash";
import { Info, Blocks, ChevronRight } from "lucide-react";
import { useState } from "react";
import { ReadOnlyJSON } from "./read-only-json";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sanitizedKey: { [key: string]: string } = {
  targetFn: "Function",
  workflowId: "Run ID",
  clusterId: "Cluster ID",
};

function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getEventSpacing(msSincePreviousEvent: number) {
  if (msSincePreviousEvent === 0) return "py-0.5"; // First event
  if (msSincePreviousEvent < 60000) return "-mt-1"; // Less than 1 minute
  if (msSincePreviousEvent < 300000) return "mt-4"; // Less than 5 minutes
  return "mt-8"; // More than 5 minutes
}

export function DebugEvent({
  event,
  clusterId,
  msSincePreviousEvent,
}: {
  event: ClientInferResponseBody<
    typeof contract.getRunTimeline,
    200
  >["activity"][number];
  clusterId: string;
  msSincePreviousEvent: number;
}) {
  const [eventMeta, setEventMeta] = useState<any | null>(null);
  const { getToken } = useAuth();

  const isSessionEnd = msSincePreviousEvent >= 300000; // 5 minutes gap indicates session end

  const fetchEventMeta = async () => {
    if (eventMeta) return;
    try {
      const response = await client.getEventMeta({
        params: { clusterId, eventId: event.id },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });
      if (response.status === 200) {
        setEventMeta(response.body.meta);
      } else {
        console.error("Failed to fetch event metadata");
      }
    } catch (error) {
      console.error("Error fetching event metadata:", error);
    }
  };

  return (
    <div
      className={cn(
        "ml-8 relative group",
        getEventSpacing(msSincePreviousEvent),
      )}
    >
      <div
        className={cn(
          "absolute left-1 w-[2px] -top-4 -bottom-4 -z-10",
          msSincePreviousEvent < 60000
            ? "bg-border/50"
            : isSessionEnd
              ? "bg-gradient-to-b from-transparent via-transparent to-border/50"
              : "bg-gradient-to-b from-transparent via-border/50 to-border/50",
        )}
      />

      <div className="flex items-start gap-4 relative">
        <div
          className={cn(
            "shrink-0 mt-2 rounded-full relative z-10 ring-4 ring-white",
            isSessionEnd
              ? "w-3 h-3 -ml-0.5 border-2 border-gray-400 bg-white"
              : "bg-gray-900",
            msSincePreviousEvent < 60000 ? "w-2 h-2" : "w-3 h-3 -ml-0.5",
          )}
        />

        <div className="flex-1">
          <Sheet>
            <SheetTrigger asChild>
              <button
                onClick={fetchEventMeta}
                className="flex items-center gap-2 group/header hover:bg-secondary/20 rounded-md px-2 py-1 -ml-2 transition-colors duration-200 w-full text-left"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-gray-700">
                    {startCase(event.type)}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {formatDateTime(event.createdAt)}
                    {msSincePreviousEvent > 0 && (
                      <span className="text-primary/70">{` +${(msSincePreviousEvent / 1000).toFixed(1)}s`}</span>
                    )}
                  </span>
                </div>
              </button>
            </SheetTrigger>
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
                      <div className="font-mono">{startCase(event.type)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </div>
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="rounded-xl bg-white p-4 shadow-sm border border-border/50 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <Info className="w-3 h-3 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Event Details</div>
                      <div className="text-xs text-muted-foreground">
                        Event ID: {event.id}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(event).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <dt className="text-xs font-medium text-muted-foreground">
                          {sanitizedKey[key] ?? startCase(key)}
                        </dt>
                        <dd className="text-sm">
                          {value instanceof Date
                            ? formatDateTime(value)
                            : String(value) || "—"}
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

                  {eventMeta ? (
                    <ReadOnlyJSON key={event.id} json={eventMeta} />
                  ) : (
                    <div className="flex items-center justify-center h-24">
                      <p className="text-sm text-muted-foreground">
                        No metadata available
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
