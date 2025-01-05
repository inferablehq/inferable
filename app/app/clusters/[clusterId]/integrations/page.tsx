import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  BarChartHorizontal,
  FunctionSquare,
  LucideIcon,
  Search,
  Slack,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import { client } from "@/client/client";
import { auth } from "@clerk/nextjs";
import ErrorDisplay from "@/components/error-display";
import { revalidatePath } from "next/cache";

type IntegrationConfig = {
  [K in 'toolhouse' | 'langfuse' | 'tavily' | 'zapier' | 'valtown' | 'slack']: {
    name: string;
    description: string;
    icon: LucideIcon;
    stage: "alpha" | "beta" | "stable";
  }
};

const config: IntegrationConfig = {
  toolhouse: {
    name: "Toolhouse",
    description:
      "Connect your toolhouse.ai tools directly to your Inferable Runs",
    icon: Wrench,
    stage: "beta",
  },
  langfuse: {
    name: "Langfuse",
    description: "Send LLM telemetry to Langfuse for monitoring and analytics",
    icon: BarChartHorizontal,
    stage: "stable",
  },
  tavily: {
    name: "Tavily",
    description: "Use Tavily to search the web for information",
    icon: Search,
    stage: "stable",
  },
  zapier: {
    name: "Zapier",
    description: "Integrate your Inferable Runs with Zapier",
    icon: Zap,
    stage: "alpha",
  },
  valtown: {
    name: "Val.town",
    description: "Register a service with a Val from Val.town",
    icon: FunctionSquare,
    stage: "alpha",
  },
  slack: {
    name: "Slack",
    description: "Trigger Runs from your Slack workspace",
    icon: Slack,
    stage: "alpha",
  },
};

const stageDescriptions = {
  "alpha": "In development, lacking docs",
  "beta": "In testing, has docs",
  "stable": "Stable, suitable for production use"
} as const;

const getStageStyles = (stage: "alpha" | "beta" | "stable") => {
  switch (stage) {
    case "alpha":
      return "bg-red-100 text-red-700";
    case "beta":
      return "bg-yellow-100 text-yellow-700";
    case "stable":
      return "bg-green-100 text-green-700";
  }
};

export default async function IntegrationsPage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = auth();

  const response = await client.getIntegrations({
    headers: {
      authorization: `Bearer ${await getToken()}`,
    },
    params: {
      clusterId,
    },
  });

  if (response.status !== 200) {
    return <ErrorDisplay status={response.status} error={response.body} />;
  }

  async function handleUninstall(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;

    const { getToken } = auth();

    await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: { clusterId },
      body: {
        [name]: null,
      },
    });

    revalidatePath(`/clusters/${clusterId}/integrations`);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-2">Integrations</h1>
      <p className="text-gray-500 mb-6">
        Connect your Inferable cluster with other tools and services
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(response.body)
          .concat([["zapier", null]])
          .map(([key, integration]) => {
            const c = config[key as keyof typeof config];
            if (!c) return null;
            const Icon = c.icon;

            return (
              <Card className="flex flex-col" key={key}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <CardTitle>{c.name}</CardTitle>
                    <div className="group relative">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStageStyles(c.stage)}`}
                      >
                        {c.stage}
                      </span>
                      <div className="invisible group-hover:visible absolute left-0 top-full mt-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                        {stageDescriptions[c.stage]}
                      </div>
                    </div>
                  </div>
                  <CardDescription>{c.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex items-end">
                  <div className="w-full flex gap-2">
                    <Link
                      href={`/clusters/${clusterId}/integrations/${key}`}
                      className="flex-grow"
                    >
                      <Button className="w-full" variant="outline">
                        {integration !== null ? "Configure" : "Install"}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                    {integration !== null && (
                      <form action={handleUninstall}>
                        <input type="hidden" name="name" value={key} />
                        <Button
                          variant="destructive"
                          size="icon"
                          type="submit"
                          title="Uninstall integration"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
