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
import { Info, Blocks } from "lucide-react";
import { useState } from "react";
import { ReadOnlyJSON } from "./read-only-json";

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
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();

  const fetchEventMeta = async () => {
    if (eventMeta) return;
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ml-8 py-2 relative">
      <div className="absolute left-1 top-0 bottom-0 w-[2px] bg-gray-200 -top-2 -bottom-2"></div>

      <div className="flex items-center space-x-2 mb-1 relative">
        <div className="w-2 h-2 bg-blue-500 rounded-full relative z-10 ring-4 ring-white"></div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-700">
            {startCase(event.type)}
          </p>
          <span className="text-xs text-muted-foreground font-mono">
            {formatDateTime(event.createdAt)}
            <span className="text-muted-foreground font-mono text-blue-400">
              {msSincePreviousEvent ? ` +${msSincePreviousEvent / 1000}s` : ""}
            </span>
          </span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Info
              className="h-4 w-4 text-gray-400 cursor-pointer hover:text-gray-600"
              onClick={fetchEventMeta}
            />
          </SheetTrigger>
          <SheetContent
            side="right"
            style={{ minWidth: "80%" }}
            className="overflow-y-auto h-screen"
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
              <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50">
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

                {isLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <p className="text-sm text-muted-foreground">
                      Loading metadata...
                    </p>
                  </div>
                ) : eventMeta ? (
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
  );
}
