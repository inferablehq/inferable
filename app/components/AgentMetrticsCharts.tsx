"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  LineChart,
  LabelList,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ClientInferResponseBody } from "@ts-rest/core";
import { contract } from "@/client/contract";

export const description = "An interactive bar chart";

const chartConfig = {
  runCount: {
    label: "Runs",
    color: "hsl(210, 100%, 50%)", // Blue
  },
  jobCount: {
    label: "Calls",
    color: "hsl(120, 100%, 30%)", // Green
  },
  feedbackScore: {
    label: "Score",
    color: "hsl(200, 100%, 40%)", // Light Blue
  },
  feedbackSubmissions: {
    label: "Submissions",
    color: "hsl(140, 100%, 30%)", // Light Green
  },
} satisfies ChartConfig;

const jobChartConfig = {
  totalExecutionTime: {
    label: "Total Exec Time (s)",
    color: "hsl(210, 100%, 50%)", // Blue
  },
  averageExecutionTime: {
    label: "Avg Exec Time (s)",
    color: "hsl(120, 100%, 30%)", // Green
  },
} satisfies ChartConfig;

type PromptMetrics = ClientInferResponseBody<
  typeof contract.getAgentMetrics
>;

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0)
    parts.push(`${remainingSeconds}s`);

  return parts.slice(0, 2).join(" ");
}

export function AgentMetricsCharts({ metrics }: { metrics: PromptMetrics }) {
  const [activeChart, setActiveChart] =
    React.useState<keyof typeof chartConfig>("runCount");

  const total = React.useMemo(
    () => ({
      runCount: metrics.length,
      feedbackSubmissions: metrics.filter((m) => m.feedbackScore !== null)
        .length,
      feedbackScore: Number(
        (
          metrics
            .filter((m) => m.feedbackScore !== null)
            .reduce((acc, curr) => acc + Number(curr.feedbackScore), 0) /
          metrics.filter((m) => m.feedbackScore !== null).length
        ).toFixed(2),
      ),
    }),
    [metrics],
  );

  const metricsByDay = metrics.reduce(
    (acc, curr) => {
      const date = new Date(curr.createdAt).toISOString().split("T")[0];
      acc[date] = acc[date] || {};
      acc[date].runCount = (acc[date].runCount || 0) + 1;
      acc[date].feedbackScoreSum =
        (acc[date].feedbackScoreSum || 0) + (Number(curr.feedbackScore) || 0);
      acc[date].feedbackSubmissions =
        (acc[date].feedbackSubmissions || 0) +
        (curr.feedbackScore === null ? 0 : 1);
      acc[date].jobFailureCount =
        (acc[date].jobFailureCount || 0) + (curr.jobFailureCount || 0);
      acc[date].timeToCompletionSum =
        (acc[date].timeToCompletionSum || 0) + (curr.timeToCompletion || 0);
      acc[date].jobCount = (acc[date].jobCount || 0) + (curr.jobCount || 0);
      return acc;
    },
    {} as Record<
      string,
      {
        runCount: number;
        feedbackScoreSum: number;
        feedbackSubmissions: number;
        jobFailureCount: number;
        timeToCompletionSum: number;
        jobCount: number;
      }
    >,
  );

  const chartData = React.useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    }).reverse();

    return last30Days.map((date) => {
      const dayMetrics = metricsByDay[date] || {
        runCount: 0,
        jobCount: 0,
        feedbackScoreSum: 0,
        feedbackSubmissions: 0,
      };
      return {
        date,
        runCount: dayMetrics.runCount,
        jobCount: dayMetrics.jobCount,
        feedbackScore:
          dayMetrics.feedbackScoreSum / dayMetrics.feedbackSubmissions,
        feedbackSubmissions: dayMetrics.feedbackSubmissions,
      };
    });
  }, [metricsByDay]);

  console.log(chartData);

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>Prompt Quality</CardTitle>
          <CardDescription>
            Showing the prompt quality over time
          </CardDescription>
        </div>
        <div className="flex">
          {(["runCount", "feedbackScore", "feedbackSubmissions"] as const).map(
            (key) => {
              const chart = key;
              return (
                <button
                  key={chart}
                  data-active={activeChart === chart}
                  className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-8 sm:py-6 w-32"
                  onClick={() => setActiveChart(chart)}
                >
                  <span className="text-xs text-muted-foreground">
                    {chartConfig[chart].label}
                  </span>
                  <span className="text-lg font-bold leading-none sm:text-3xl">
                    {total[chart]}
                  </span>
                </button>
              );
            },
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          {activeChart === "feedbackScore" ? (
            <LineChart
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <YAxis
                orientation="left"
                stroke={chartConfig.feedbackScore.color}
                domain={[0, 1]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[200px]"
                    nameKey={activeChart}
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="feedbackScore"
                stroke={chartConfig.feedbackScore.color}
              >
                <LabelList
                  position="top"
                  offset={12}
                  className="fill-foreground"
                  fontSize={12}
                  formatter={(value: number) => {
                    return value.toFixed(2);
                  }}
                />
              </Line>
            </LineChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[150px]"
                    nameKey={activeChart}
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    }}
                  />
                }
              />
              <Bar
                dataKey={activeChart}
                fill={chartConfig[activeChart].color}
              />
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function JobMetricsCharts({ metrics }: { metrics: PromptMetrics }) {
  const [activeChart, setActiveChart] =
    React.useState<keyof typeof jobChartConfig>("totalExecutionTime");

  const total = React.useMemo(
    () => ({
      totalExecutionTime: metrics.reduce(
        (acc, curr) => acc + (Number(curr.timeToCompletion) || 0),
        0,
      ),
      averageExecutionTime:
        metrics.reduce(
          (acc, curr) => acc + (Number(curr.timeToCompletion) || 0),
          0,
        ) / metrics.length,
    }),
    [metrics],
  );

  const metricsByDay = metrics.reduce(
    (acc, curr) => {
      const date = new Date(curr.createdAt).toISOString().split("T")[0];
      if (!acc[date]) {
        acc[date] = { totalExecutionTime: 0, count: 0 };
      }
      acc[date].totalExecutionTime += Number(curr.timeToCompletion) || 0;
      acc[date].count += 1;
      return acc;
    },
    {} as Record<string, { totalExecutionTime: number; count: number }>,
  );

  const chartData = React.useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    }).reverse();

    return last30Days.map((date) => {
      const dayMetrics = metricsByDay[date] || {
        totalExecutionTime: 0,
        count: 0,
      };
      return {
        date,
        totalExecutionTime: dayMetrics.totalExecutionTime,
        averageExecutionTime:
          dayMetrics.count > 0
            ? dayMetrics.totalExecutionTime / dayMetrics.count
            : 0,
      };
    });
  }, [metricsByDay]);

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>Prompt Performance</CardTitle>
          <CardDescription>
            Showing execution times for the last 30 days
          </CardDescription>
        </div>
        <div className="flex">
          {(
            Object.keys(jobChartConfig) as Array<keyof typeof jobChartConfig>
          ).map((key) => (
            <button
              key={key}
              data-active={activeChart === key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-8 sm:py-6 w-48"
              onClick={() => setActiveChart(key)}
            >
              <span className="text-xs text-muted-foreground">
                {jobChartConfig[key].label}
              </span>
              <span className="text-lg font-bold leading-none sm:text-3xl">
                {formatTime(total[key])}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={jobChartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <YAxis
              orientation="left"
              stroke={jobChartConfig[activeChart].color}
              label={{ value: "Time", angle: -90, position: "insideLeft" }}
              tickFormatter={(value) => formatTime(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[200px]"
                  nameKey={activeChart}
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                  }}
                />
              }
            />
            <Bar
              dataKey={activeChart}
              fill={jobChartConfig[activeChart].color}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
