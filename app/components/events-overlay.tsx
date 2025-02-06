import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@clerk/nextjs";
import type { ClientInferResponseBody } from "@ts-rest/core";
import { format } from "date-fns";
import { snakeCase, startCase } from "lodash";
import { AlertCircle, AlertTriangle, BarChartIcon, Clock, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import ErrorDisplay from "./error-display";

type Event = ClientInferResponseBody<typeof contract.listEvents, 200>[number];

type FilterKey = "type" | "function" | "jobId" | "workflowId" | "machineId";

interface Filter {
  key: FilterKey;
  value: string;
}

interface EventsOverlayProps {
  clusterId: string;
  query?: Partial<Record<FilterKey, string>>;
  refreshInterval?: number;
}

interface EventParam {
  label: string;
  value: string;
}

const formatEventParams = (event: Event): EventParam[] => {
  const params: EventParam[] = [];

  if (event.targetFn) params.push({ label: "Function", value: event.targetFn });
  if (event.machineId) params.push({ label: "Machine", value: event.machineId });
  if (event.resultType) params.push({ label: "Result", value: event.resultType });
  if (event.status) params.push({ label: "Status", value: event.status });
  if (event.workflowId) params.push({ label: "Workflow", value: event.workflowId });

  return params;
};

const typeToText: { [key: string]: string } = {
  machinePing: `Machine pinged the control plane.`,
  machineStalled: `Machine marked as stalled.`,
  jobCreated: "Job was created.",
  jobStatusRequest: `Caller asked for the status of the job.`,
  jobReceived: `Function was received by the machine for execution.`,
  functionResulted: `Function execution concluded.`,
  jobStalled: `Function execution did not complete within the expected time frame. The function is marked as stalled.`,
  jobRecovered: `Function execution was recovered after being marked as stalled.`,
  jobStalledTooManyTimes: `Function execution did not complete within the expected time frame too many times. The execution has resulted in a failure.`,
  agentMessage: `Agent message produced.`,
  agentEnd: `Agent workflow concluded.`,
  jobAcknowledged: `Job was acknowledged by the machine.`,
  callingFunction: `Agent is invoking a tool.`,
  humanMessage: `Human sent a message.`,
  machineRegistered: `Machine registered with the control plane.`,
  functionErrored: `Invoked tool produced an error.`,
  modelInvocation: `A call was made to the model.`,
};

type FilterableEventKeys = {
  [K in FilterKey]: keyof Event;
};

const filterKeyToEventKey: FilterableEventKeys = {
  type: "type",
  function: "targetFn",
  jobId: "jobId",
  workflowId: "workflowId",
  machineId: "machineId",
};

const chartConfig: ChartConfig = {
  machinePing: {
    label: "Machine Ping",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  machineStalled: {
    label: "Machine Stalled",
    color: "hsl(0, 100%, 70%)", // Red
  },
  jobCreated: {
    label: "Job Created",
    color: "hsl(45, 100%, 70%)", // Yellow
  },
  jobStatusRequest: {
    label: "Job Status Request",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  jobReceived: {
    label: "Job Received",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  functionResulted: {
    label: "Job Resulted",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  jobStalled: {
    label: "Job Stalled",
    color: "hsl(0, 100%, 70%)", // Red
  },
  jobRecovered: {
    label: "Job Recovered",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  jobStalledTooManyTimes: {
    label: "Job Stalled Too Many Times",
    color: "hsl(0, 100%, 70%)", // Red
  },
  agentMessage: {
    label: "Agent Message",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  agentEnd: {
    label: "Agent End",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  jobAcknowledged: {
    label: "Job Acknowledged",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  callingFunction: {
    label: "Agent Tool",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  humanMessage: {
    label: "Human Message",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  machineRegistered: {
    label: "Machine Registered",
    color: "hsl(210, 100%, 70%)", // Blue
  },
  functionErrored: {
    label: "Agent Tool Error",
    color: "hsl(0, 100%, 70%)", // Red
  },
  modelInvocation: {
    label: "Model Invocation",
    color: "hsl(210, 100%, 70%)", // Blue
  },
} satisfies ChartConfig;

const getEventCountsByTime = (events: Event[]) => {
  if (events.length === 0) return [];

  const earliestEventTime = new Date(
    Math.min(...events.map(event => new Date(event.createdAt).getTime()))
  );

  const timeNow = new Date();

  const differenceInMs = timeNow.getTime() - earliestEventTime.getTime();

  const bucketCount = 20;

  const bucketStartTimes = Array.from({ length: bucketCount }, (_, i) => {
    const time = new Date(earliestEventTime);
    time.setMilliseconds(time.getMilliseconds() + i * (differenceInMs / bucketCount));
    return time;
  });

  // Format data for chart
  return bucketStartTimes.map((t, i) => {
    const eventsInBucket = events.filter(event => {
      const eventTime = new Date(event.createdAt);
      return eventTime >= t && eventTime < bucketStartTimes[i + 1];
    });
    return {
      date: t.toISOString(),
      ...eventsInBucket.reduce(
        (acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  });
};

export function EventsOverlayButton({
  clusterId,
  query,
  text = "",
}: {
  clusterId: string;
  query?: Partial<Record<FilterKey, string>>;
  text?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className="gap-2" size="sm">
          <BarChartIcon className="h-4 w-4" /> {text}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="min-w-[90vw] p-0">
        <EventsOverlay clusterId={clusterId} query={query} />
      </SheetContent>
    </Sheet>
  );
}

function EventsOverlay({ clusterId, query = {}, refreshInterval = 10000 }: EventsOverlayProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<Filter[]>(
    Object.entries(query).map(([key, value]) => ({
      key: key as FilterKey,
      value: value as string,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const { getToken } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const fetchEvents = useCallback(
    async (filters: Filter[] = []) => {
      try {
        const response = await client.listEvents({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: {
            clusterId,
          },
          query: filters.reduce(
            (acc, filter) => {
              acc[filter.key] = filter.value;
              return acc;
            },
            {} as Partial<Record<FilterKey, string>>
          ),
        });

        if (response.status === 200) {
          setEvents(response.body);
        } else {
          setError(response);
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [clusterId, getToken]
  );

  useEffect(() => {
    console.log("fetching events", filters);

    fetchEvents(filters);
    const interval = setInterval(() => fetchEvents(filters), refreshInterval);
    return () => clearInterval(interval);
  }, [fetchEvents, refreshInterval, filters]);

  const addFilter = (event: Event) => {
    const newFilters: Filter[] = [];

    if (event.type) newFilters.push({ key: "type", value: event.type });
    if (event.targetFn) newFilters.push({ key: "function", value: event.targetFn });
    if (event.machineId) newFilters.push({ key: "machineId", value: event.machineId });
    if (event.workflowId) newFilters.push({ key: "workflowId", value: event.workflowId });

    setFilters(prev => {
      const updated = [...prev];
      newFilters.forEach(newFilter => {
        const existingIndex = updated.findIndex(
          f => f.key === newFilter.key && f.value === newFilter.value
        );
        if (existingIndex === -1) {
          updated.push(newFilter);
        }
      });
      return updated;
    });
  };

  const removeFilter = (filterToRemove: Filter) => {
    setFilters(prev =>
      prev.filter(f => !(f.key === filterToRemove.key && f.value === filterToRemove.value))
    );
  };

  const getFilteredEvents = useCallback(() => {
    return events.filter(event => {
      const matchesFilters = filters.every(filter => {
        const eventKey = filterKeyToEventKey[filter.key];
        const eventValue = event[eventKey];
        return eventValue === filter.value;
      });

      if (!matchesFilters) return false;

      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();

      return (
        Object.values(filterKeyToEventKey).some(key => {
          const value = event[key];
          return value?.toString().toLowerCase().includes(searchLower);
        }) || typeToText[event.type]?.toLowerCase().includes(searchLower)
      );
    });
  }, [events, filters, searchTerm]);

  if (error) {
    return <ErrorDisplay status={error.status} error={error} />;
  }

  return (
    <>
      <SheetHeader className="border-b p-4 pb-4">
        <SheetTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" /> Event Stream{" "}
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </SheetTitle>
        <div className="flex flex-col gap-4 mt-4">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1.5 pr-1.5">
                <span className="text-muted-foreground">{startCase(filter.key)}:</span>
                <span>{filter.value}</span>
                <button
                  onClick={() => removeFilter(filter)}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            ))}
            {filters.length === 0 && !searchTerm && (
              <span className="text-sm text-muted-foreground">
                Showing events for the whole cluster. Click on event parameters to add filters or
                use the search bar.
              </span>
            )}
          </div>
        </div>
      </SheetHeader>

      <Card className="mx-4 my-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Event Frequency</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
            <BarChart
              data={getEventCountsByTime(getFilteredEvents())}
              margin={{
                top: 10,
                right: 30,
                left: 20,
                bottom: 30,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickFormatter={value => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    minute: "2-digit",
                    hour: "2-digit",
                  });
                }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[250px]"
                    nameKey="count"
                    labelFormatter={value => {
                      return new Date(value).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    }}
                  />
                }
              />
              {Object.entries(chartConfig).map(([key, config]) => (
                <Bar
                  key={key}
                  stackId="date"
                  dataKey={key}
                  fill={config.color}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <ScrollArea className="h-[calc(100vh-100px)]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-muted-foreground">Loading events...</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {getFilteredEvents().map(event => (
              <div key={event.id} className="p-4 hover:bg-secondary/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-0.5 shrink-0 text-xs text-muted-foreground w-24">
                    <span>{format(new Date(event.createdAt), "MMM dd, yyyy")}</span>
                    <span>{format(new Date(event.createdAt), "HH:mm:ss")}</span>
                  </div>
                  <div
                    className="w-1 h-11"
                    style={{
                      backgroundColor: chartConfig[event.type]?.color,
                    }}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <code
                          className="text-xs px-1.5 py-0.5 rounded bg-secondary cursor-pointer hover:bg-secondary/80"
                          onClick={e => {
                            e.stopPropagation();
                            addFilter(event);
                          }}
                        >
                          {snakeCase(event.type).toUpperCase()}
                        </code>
                        <p className="text-sm text-muted-foreground">{typeToText[event.type]}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {formatEventParams(event).map((param, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="flex items-center gap-1 text-xs cursor-pointer hover:bg-secondary/80"
                            onClick={e => {
                              e.stopPropagation();
                              addFilter(event);
                            }}
                          >
                            <span className="text-muted-foreground">{param.label}:</span>
                            <span>{param.value}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}
