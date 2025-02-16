"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  BarChartHorizontal,
  FunctionSquare,
  LucideIcon,
  Mail,
  Search,
  Slack,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import { client } from "@/client/client";
import { useAuth } from "@clerk/nextjs";
import ErrorDisplay from "@/components/error-display";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useCallback, useEffect } from "react";
import { toast } from "react-hot-toast";

type IntegrationConfig = {
  [K in "langfuse" | "slack"]: {
    name: string;
    description: string;
    icon: LucideIcon;
    stage: "alpha" | "beta" | "stable";
    category: string;
    order: number;
    docs: string;
  };
};

const descriptionsForCategory = {
  ["Observability"]: "These integrations allow you to monitor your Inferable Runs",
  ["Triggers"]: "These integrations allow you to trigger Inferable Runs via external events",
  ["Tools"]: "These integrations allow you to build tools that can be used in your Inferable Runs",
};

const config: IntegrationConfig = {
  langfuse: {
    name: "Langfuse",
    description: "Send LLM telemetry to Langfuse for monitoring and analytics",
    icon: BarChartHorizontal,
    stage: "stable",
    category: "Observability",
    order: 1,
    docs: "https://docs.inferable.ai/pages/langfuse",
  },
  slack: {
    name: "Slack",
    description: "Receive notifications and converse with your Agents via Slack.",
    icon: Slack,
    stage: "stable",
    category: "Triggers",
    order: 5,
    docs: "https://docs.inferable.ai/pages/slack",
  },
};

const stageDescriptions = {
  alpha: "In development, lacking docs",
  beta: "In testing, has docs",
  stable: "Stable, suitable for production use",
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

export default function IntegrationsPage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [integrationToDelete, setIntegrationToDelete] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const response = await client.getIntegrations({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
        },
      });

      if (response.status !== 200) {
        setError(response);
        return;
      }

      setIntegrations(response.body);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [clusterId, getToken]);

  const handleUninstall = useCallback(
    async (name: string) => {
      try {
        const response = await client.upsertIntegrations({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: { clusterId },
          body: {
            [name]: null,
          },
        });

        if (response.status === 200) {
          toast.success(`${name} integration uninstalled successfully`);
          fetchIntegrations();
          router.refresh();
        } else {
          toast.error(`Failed to uninstall ${name} integration`);
        }
      } catch (error) {
        toast.error(`Failed to uninstall ${name} integration`);
      }
    },
    [clusterId, getToken, router, fetchIntegrations]
  );

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return <ErrorDisplay status={error.status} error={error.body} />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-2">Integrations</h1>
      <p className="text-gray-500 mb-6">Connect your Inferable cluster with other tools</p>

      {["Triggers", "Observability"].map(category => (
        <div key={category}>
          <h2 className="text-xl font-semibold mt-6">{category}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {descriptionsForCategory[category as keyof typeof descriptionsForCategory] ?? ""}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(integrations)
              .concat([["zapier", null]])
              .sort((a, b) => {
                const aConfig = config[a[0] as keyof typeof config];
                const bConfig = config[b[0] as keyof typeof config];
                return (aConfig?.order ?? 0) - (bConfig?.order ?? 0);
              })
              .filter(([key]) => {
                const c = config[key as keyof typeof config];
                return c && c.category === category;
              })
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
                        <Link href={c.docs} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" title="View documentation">
                            Docs
                          </Button>
                        </Link>
                        {integration !== null && (
                          <AlertDialog
                            open={integrationToDelete === key}
                            onOpenChange={open => !open && setIntegrationToDelete(null)}
                          >
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => setIntegrationToDelete(key)}
                              title="Uninstall integration"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove {c.name} Integration</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove the {c.name} integration?
                                  <br />
                                  <br />
                                  <b>This will remove all associated configuration.</b>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => {
                                    handleUninstall(key);
                                    setIntegrationToDelete(null);
                                  }}
                                >
                                  Uninstall
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
