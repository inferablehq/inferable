import { client } from "@/client/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auth } from "@clerk/nextjs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

type BillableRate = {
  input: number;
  output: number;
};

const billable: [string, BillableRate][] = [
  [
    "claude-3-5-sonnet",
    {
      input: 0.003,
      output: 0.015,
    },
  ],
  [
    "claude-3-5-haiku",
    {
      input: 0.001,
      output: 0.005,
    },
  ],
  [
    "unknown",
    {
      input: 0.0,
      output: 0.0,
    },
  ],
];

export default async function UsagePage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = auth();

  const result = await client.listUsageActivity({
    headers: { authorization: `Bearer ${await getToken()}` },
    params: { clusterId },
  });

  if (result.status !== 200) {
    throw new Error("Failed to fetch usage data");
  }

  const { modelUsage, runs } = result.body;

  // Calculate totals for model usage
  const modelTotals = modelUsage.reduce(
    (acc, curr) => ({
      totalInputTokens: acc.totalInputTokens + curr.totalInputTokens,
      totalOutputTokens: acc.totalOutputTokens + curr.totalOutputTokens,
      totalModelInvocations:
        acc.totalModelInvocations + curr.totalModelInvocations,
    }),
    {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalModelInvocations: 0,
    },
  );

  // Calculate totals for agent runs
  const predictionsTotal = runs.reduce(
    (acc, curr) => acc + curr.totalRuns,
    0,
  );

  // Calculate current billing cycle dates
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let cycleStart = new Date(currentYear, currentMonth, 15);
  let cycleEnd = new Date(currentYear, currentMonth + 1, 14);

  if (currentDay < 15) {
    cycleStart = new Date(currentYear, currentMonth - 1, 15);
    cycleEnd = new Date(currentYear, currentMonth, 14);
  }

  const freeTierRemaining = Math.max(0, 500 - predictionsTotal);

  // Group model usage by model ID
  const modelGroups = modelUsage.reduce(
    (acc, curr) => {
      const modelId = curr.modelId || "Unknown";
      if (!acc[modelId]) {
        acc[modelId] = [];
      }
      acc[modelId].push(curr);
      return acc;
    },
    {} as Record<string, typeof modelUsage>,
  );

  // Calculate totals for each model
  const modelGroupTotals = Object.entries(modelGroups).reduce(
    (acc, [modelId, usage]) => {
      acc[modelId] = usage.reduce(
        (modelAcc, curr) => ({
          totalInputTokens: modelAcc.totalInputTokens + curr.totalInputTokens,
          totalOutputTokens:
            modelAcc.totalOutputTokens + curr.totalOutputTokens,
          totalModelInvocations:
            modelAcc.totalModelInvocations + curr.totalModelInvocations,
        }),
        {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalModelInvocations: 0,
        },
      );
      return acc;
    },
    {} as Record<string, typeof modelTotals>,
  );

  // Calculate costs per model
  const modelCostsBreakdown = Object.entries(modelGroupTotals).reduce(
    (acc, [modelId, usage]) => {
      // Special case for unknown models
      if (modelId.toLowerCase() === "unknown") {
        acc[modelId] = {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          rate: {
            input: 0,
            output: 0,
          },
        };
        return acc;
      }

      const matchingRate = billable.find(([model]) => modelId.includes(model));
      const rate: BillableRate = matchingRate?.[1] ?? {
        input: 0.003, // default to sonnet rates if no match
        output: 0.015,
      };

      // Round down to nearest 1000 tokens before calculating cost
      const inputTokensRounded =
        Math.floor(usage.totalInputTokens / 1000) * 1000;
      const outputTokensRounded =
        Math.floor(usage.totalOutputTokens / 1000) * 1000;

      const inputTokenCost = (inputTokensRounded / 1000) * rate.input;
      const outputTokenCost = (outputTokensRounded / 1000) * rate.output;

      acc[modelId] = {
        inputCost: inputTokenCost,
        outputCost: outputTokenCost,
        totalCost: inputTokenCost + outputTokenCost,
        rate,
      };
      return acc;
    },
    {} as Record<
      string,
      {
        inputCost: number;
        outputCost: number;
        totalCost: number;
        rate: BillableRate;
      }
    >,
  );

  // Update calculateCosts to use the breakdown
  const calculateCosts = () => {
    const paidPredictions = Math.max(0, predictionsTotal - 500);
    const platformCost = (paidPredictions / 100) * 0.5;

    const modelCosts = Object.values(modelCostsBreakdown).reduce(
      (acc, curr) => acc + curr.totalCost,
      0,
    );

    const totalModelCost = Math.max(0, modelCosts - 5);

    return {
      platformCost,
      rawModelCost: modelCosts,
      modelCostAfterFreeTier: totalModelCost,
      totalCost: platformCost + totalModelCost,
      modelFreeTierRemaining: Math.max(0, 5 - modelCosts),
    };
  };

  const costs = calculateCosts();

  return (
    <div className="p-6 space-y-6 text-sm">
      <Card>
        <CardHeader>
          <CardTitle>Billing Cycle Information</CardTitle>
          <CardDescription>
            Current billing period: {cycleStart.toLocaleDateString()} -{" "}
            {cycleEnd.toLocaleDateString()}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free Tier Status</CardTitle>
          <CardDescription>
            Monthly free tier allowance and usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">Predictions Free Tier</span>
              <span className="text-sm text-muted-foreground">
                {predictionsTotal} / 500 used
              </span>
            </div>
            <Progress value={(predictionsTotal / 500) * 100} />
            {freeTierRemaining > 0 && (
              <p className="text-sm text-green-600">
                {freeTierRemaining} predictions remaining
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">Model Usage Free Tier</span>
              <span className="text-sm text-muted-foreground">
                ${costs.rawModelCost.toFixed(2)} / $5.00 used
              </span>
            </div>
            <Progress value={(costs.rawModelCost / 5) * 100} />
            {costs.modelFreeTierRemaining > 0 && (
              <p className="text-sm text-green-600">
                ${costs.modelFreeTierRemaining.toFixed(2)} remaining
              </p>
            )}
          </div>

          <div className="text-sm text-muted-foreground mt-4">
            Your free tier includes 500 predictions and $5 of model costs each
            billing cycle.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pay As You Go Usage</CardTitle>
          <CardDescription>
            Billable usage beyond free tier allowance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Platform Usage</span>
              <span>
                {Math.max(0, predictionsTotal - 500).toLocaleString()} paid
                predictions
                <span className="text-muted-foreground ml-2">
                  (${costs.platformCost.toFixed(2)})
                </span>
              </span>
            </div>

            <div className="flex justify-between">
              <span className="font-medium">Model Usage</span>
              <span className="text-right">
                <div className="text-sm text-muted-foreground">
                  Billable amount: ${costs.modelCostAfterFreeTier.toFixed(2)}
                </div>
              </span>
            </div>

            <div className="pt-4 flex justify-between border-t">
              <span className="font-bold">Total Billable Amount</span>
              <span className="font-bold">${costs.totalCost.toFixed(2)}</span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Platform fee: $0.50 per 100 predictions after free tier. Models
            token usage is billed at cost.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Usage Statistics</CardTitle>
          <CardDescription>
            Daily token usage and model invocations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue={Object.keys(modelGroups)[0] || "all"}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="all">All Models</TabsTrigger>
              {Object.keys(modelGroups).map((modelId) => (
                <TabsTrigger key={modelId} value={modelId}>
                  {modelId}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Input Tokens</TableHead>
                    <TableHead className="text-right">Output Tokens</TableHead>
                    <TableHead className="text-right">Model Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelUsage.map((day) => (
                    <TableRow key={`${day.date}-${day.modelId}`}>
                      <TableCell>{day.date}</TableCell>
                      <TableCell>{day.modelId || "Unknown"}</TableCell>
                      <TableCell className="text-right">
                        {day.totalInputTokens?.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {day.totalOutputTokens?.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {day.totalModelInvocations?.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right">
                      {modelTotals.totalInputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {modelTotals.totalOutputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {modelTotals.totalModelInvocations.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </TabsContent>

            {Object.entries(modelGroups).map(([modelId, usage]) => (
              <TabsContent key={modelId} value={modelId}>
                <div className="space-y-4">
                  <div className="rounded-md border p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Input Token Cost</span>
                      <span>
                        ${modelCostsBreakdown[modelId].inputCost.toFixed(2)}
                        <span className="text-muted-foreground ml-2">
                          (${modelCostsBreakdown[modelId].rate.input.toFixed(3)}{" "}
                          per 1K tokens)
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Output Token Cost</span>
                      <span>
                        ${modelCostsBreakdown[modelId].outputCost.toFixed(2)}
                        <span className="text-muted-foreground ml-2">
                          ($
                          {modelCostsBreakdown[modelId].rate.output.toFixed(
                            3,
                          )}{" "}
                          per 1K tokens)
                        </span>
                      </span>
                    </div>
                    <div className="pt-2 flex justify-between border-t">
                      <span className="font-bold">Total Model Cost</span>
                      <span className="font-bold">
                        ${modelCostsBreakdown[modelId].totalCost.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">
                          Input Tokens
                        </TableHead>
                        <TableHead className="text-right">
                          Output Tokens
                        </TableHead>
                        <TableHead className="text-right">
                          Model Calls
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell>{day.date}</TableCell>
                          <TableCell className="text-right">
                            {day.totalInputTokens?.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {day.totalOutputTokens?.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {day.totalModelInvocations?.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {modelGroupTotals[
                            modelId
                          ].totalInputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {modelGroupTotals[
                            modelId
                          ].totalOutputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {modelGroupTotals[
                            modelId
                          ].totalModelInvocations.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prediction Statistics</CardTitle>
          <CardDescription>Daily prediction counts</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Predictions</TableHead>
              </TableRow>
            </TableHeader>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {predictionsTotal.toLocaleString()}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
