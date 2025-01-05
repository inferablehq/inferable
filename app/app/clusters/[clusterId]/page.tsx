"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { LiveAmberCircle, LiveGreenCircle } from "@/components/circles";
import ErrorDisplay from "@/components/error-display";
import { Loading } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { ClipboardCopy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import theme from "react-syntax-highlighter/dist/cjs/styles/hljs/tomorrow";
import SyntaxHighlighter from "react-syntax-highlighter";

function OnboardingStep({
  number,
  title,
  description,
  completed,
  children,
  grayedOut,
}: {
  number: number;
  title: string;
  description: string;
  completed: boolean;
  grayedOut: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border rounded-lg p-6 mb-4 ${completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"} ${grayedOut ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            completed
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {completed ? "✓" : number}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-base mb-1">{title}</h3>
          <p className="text-gray-600 mb-4">{description}</p>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

const script = (
  apiKey: string,
  localhost: boolean = false,
) => `echo 'const { Inferable } = require("inferable");

const client = new Inferable({
  apiSecret: "${apiKey}", ${localhost ? 'endpoint: "http://localhost:4000"' : ""}
});

client.default.register({
  name: "userInfo",
  func: async () => {
    return require("os").userInfo();
  },
});

client.default.start();' > quickstart.js && npm install inferable@latest && node quickstart.js`;

export default function Page({ params }: { params: { clusterId: string } }) {
  const [cluster, setCluster] = useState<ClientInferResponseBody<
    typeof contract.getCluster,
    200
  > | null>(null);
  const [runs, setRuns] = useState<
    ClientInferResponseBody<typeof contract.listRuns, 200>
  >([]);
  const [apiKeys, setApiKeys] = useState<
    ClientInferResponseBody<typeof contract.listApiKeys, 200>
  >([]);
  const [error, setError] = useState<{ error: any; status: number } | null>(
    null,
  );
  const [services, setServices] = useState<
    ClientInferResponseBody<typeof contract.listServices, 200>
  >([]);
  const { getToken } = useAuth();

  const [hasCustomName, setHasCustomName] = useState(false);
  const [skippedOnboarding, setSkippedOnboarding] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      const services = await client.listServices({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: params.clusterId,
        },
      });

      if (services.status === 200) {
        setServices(services.body);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [params.clusterId, getToken]);

  useEffect(() => {
    async function fetchData() {
      const token = await getToken();

      const clusterResult = await client.getCluster({
        headers: {
          authorization: `Bearer ${token}`,
        },
        params: {
          clusterId: params.clusterId,
        },
      });

      if (clusterResult.status !== 200) {
        setError({ error: clusterResult.body, status: clusterResult.status });
        return;
      }

      const runsResult = await client.listRuns({
        headers: {
          authorization: `Bearer ${token}`,
        },
        params: {
          clusterId: params.clusterId,
        },
      });

      if (runsResult.status !== 200) {
        setError({ error: runsResult.body, status: runsResult.status });
        return;
      }

      const apiKeysResult = await client.listApiKeys({
        headers: {
          authorization: `Bearer ${token}`,
        },
        params: {
          clusterId: params.clusterId,
        },
      });

      if (apiKeysResult.status !== 200) {
        setError({ error: apiKeysResult.body, status: apiKeysResult.status });
        return;
      }

      setCluster(clusterResult.body);
      setClusterName(clusterResult.body.name);
      setRuns(runsResult.body);
      setApiKeys(apiKeysResult.body);
    }

    fetchData();
  }, [params.clusterId, getToken]);

  useEffect(() => {
    const skipped = localStorage.getItem(
      `onboarding-skipped-${params.clusterId}`,
    );
    if (skipped === "true") {
      setSkippedOnboarding(true);
    }
  }, [params.clusterId]);

  const [clusterName, setClusterName] = useState("");

  const [createdApiKey, setCreatedApiKey] = useState<ClientInferResponseBody<
    typeof contract.createApiKey,
    200
  > | null>(null);

  const router = useRouter();

  if (error) {
    return <ErrorDisplay error={error} status={error.status} />;
  }

  if (!cluster) {
    return <Loading />;
  }

  const hasRuns = runs.length > 0;
  const hasQuickstartService = services.length > 0;

  const handleRename = async (name: string) => {
    const result = await client.updateCluster({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: { clusterId: params.clusterId },
      body: { name },
    });

    if (result.status === 204) {
      setClusterName(name);
      setHasCustomName(true);
    } else {
      setError({ error: result.body, status: result.status });
    }
  };

  const handleCreateApiKey = async () => {
    const random = Math.random().toString(36).substring(2, 6);
    const name = `quickstart-${random}`;

    const result = await client.createApiKey({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: params.clusterId,
      },
      body: {
        name,
      },
    });

    if (result.status !== 200) {
      setError({ error: result.body, status: result.status });
      return;
    }

    setCreatedApiKey(result.body);

    // Refresh API keys
    const apiKeysResult = await client.listApiKeys({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: params.clusterId,
      },
    });

    if (apiKeysResult.status === 200) {
      setApiKeys(apiKeysResult.body);
    }
  };

  const handleCreateRun = async () => {
    const created = await client.createRun({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: params.clusterId,
      },
      body: {
        initialPrompt: "Can you summarise my user information?",
        name: "My first run",
      },
    });

    if (created.status === 201) {
      localStorage.setItem(`onboarding-completed-${params.clusterId}`, "true");
      toast.success("🙌 First run created. Redirecting you there...");
      router.push(`/clusters/${params.clusterId}/runs/${created.body.id}`);
    } else {
      setError({ error: created.body, status: created.status });
    }
  };

  const handleSkipOnboarding = () => {
    localStorage.setItem(`onboarding-skipped-${params.clusterId}`, "true");
    setSkippedOnboarding(true);
  };

  const skipOnboarding = skippedOnboarding || runs.length > 0;

  if (!skipOnboarding) {
    return (
      <div className="max-w-6xl p-6 text-sm">
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl">Welcome to your new cluster</h2>
            <Button variant="ghost" size="sm" onClick={handleSkipOnboarding}>
              Skip onboarding
            </Button>
          </div>
          <div className="space-y-4">
            <OnboardingStep
              number={1}
              title="Name your cluster"
              description="Give your cluster a memorable name to easily identify it"
              completed={hasCustomName}
              grayedOut={false}
            >
              <div className="flex flex-col items-start gap-2">
                <Input
                  value={clusterName}
                  placeholder="Cluster name"
                  onChange={(e) => setClusterName(e.target.value)}
                />
                <Button
                  size="sm"
                  type="submit"
                  onClick={() => handleRename(clusterName)}
                  disabled={clusterName === cluster.name}
                >
                  Rename
                </Button>
              </div>
            </OnboardingStep>

            <OnboardingStep
              number={2}
              title="Create an API key"
              description="Generate an API key to authenticate your requests"
              completed={!!createdApiKey}
              grayedOut={!hasCustomName}
            >
              <div className="flex flex-col items-start gap-2">
                {createdApiKey ? (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-sm text-gray-600">
                      We created an API key for you. Copy it to your clipboard,
                      because you won&apos;t be able to see it later.
                    </p>
                    <p className="text-sm text-gray-600 font-mono my-2">
                      {createdApiKey.key}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(createdApiKey.key);
                        toast.success("Copied to clipboard");
                      }}
                    >
                      Copy to clipboard
                      <ClipboardCopy className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" type="submit" onClick={handleCreateApiKey}>
                    Create API key
                  </Button>
                )}
              </div>
            </OnboardingStep>

            <OnboardingStep
              number={3}
              title="Connect quickstart function"
              description="Use the API key you created to connect a sample function."
              completed={hasQuickstartService}
              grayedOut={!createdApiKey || !hasCustomName}
            >
              <div className="relative">
                <div className="pb-2">
                  {hasQuickstartService ? (
                    <div className="flex space-x-2 items-center">
                      <LiveGreenCircle />
                      <p className="text-xs text-gray-600">
                        Quickstart service has been connected
                      </p>
                    </div>
                  ) : (
                    <div className="flex space-x-2 items-center">
                      <LiveAmberCircle />
                      <p className="text-xs text-gray-600">
                        Waiting for quickstart service to connect...
                      </p>
                    </div>
                  )}
                </div>
                {createdApiKey && (
                  <div className="relative">
                    <SyntaxHighlighter
                      language="bash"
                      style={theme}
                      customStyle={{
                        padding: "1rem",
                        borderRadius: "0.5rem",
                        border: "1px solid #e0e0e0",
                        backgroundColor: "#fafafa",
                      }}
                    >
                      {script(
                        createdApiKey?.key ?? "",
                        window.location.hostname === "localhost",
                      )}
                    </SyntaxHighlighter>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          script(
                            createdApiKey?.key ?? "",
                            window.location.hostname === "localhost",
                          ),
                        );
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <ClipboardCopy className="w-4 h-4" />
                    </Button>
                    <p className="mt-2 text-sm text-gray-600">
                      Copy and paste the script above into your terminal to
                      connect the quickstart function.
                    </p>
                  </div>
                )}
              </div>
            </OnboardingStep>

            <OnboardingStep
              number={4}
              title="Create your first run"
              description="Start using your cluster by creating your first run"
              completed={hasRuns}
              grayedOut={
                !hasQuickstartService || !createdApiKey || !hasCustomName
              }
            >
              <div className="flex flex-col items-start gap-2">
                <Input
                  name="name"
                  placeholder="Run name"
                  value="Can you summarise my user information?"
                />
                <Button size="sm" onClick={handleCreateRun}>
                  Create run
                </Button>
              </div>
            </OnboardingStep>
          </div>
        </>
      </div>
    );
  }

  return (
    <div className="max-w-6xl p-6 text-sm">
      <h2 className="text-2xl mb-6">Cluster Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <Card className="transition-colors flex flex-col">
          <CardHeader className="flex-grow">
            <CardTitle className="text-lg">Go to my runs</CardTitle>
            <CardDescription>
              View and manage your existing runs or create new ones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push(`/clusters/${params.clusterId}/runs`)}
              variant="secondary"
              className="hover:bg-gray-50"
            >
              View runs
            </Button>
          </CardContent>
        </Card>

        <Card className="transition-colors flex flex-col">
          <CardHeader className="flex-grow">
            <CardTitle className="text-lg">Configure cluster</CardTitle>
            <CardDescription>
              Manage API keys, services, and cluster settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() =>
                router.push(`/clusters/${params.clusterId}/settings`)
              }
              variant="secondary"
              className="hover:bg-gray-50"
            >
              Open settings
            </Button>
          </CardContent>
        </Card>

        <Card className="transition-colors flex flex-col">
          <CardHeader className="flex-grow">
            <CardTitle className="text-lg">Read the docs</CardTitle>
            <CardDescription>
              Learn more about how to use your cluster effectively
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => window.open("https://docs.inferable.ai", "_blank")}
              variant="secondary"
              className="hover:bg-gray-50"
            >
              Open docs
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
