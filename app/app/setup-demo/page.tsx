"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { client } from "@/client/client";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowRight, Brain } from "lucide-react";
import { GlobalBreadcrumbs } from "@/components/breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createErrorToast } from "@/lib/utils";
import toast from "react-hot-toast";
import { Header } from "@/components/header";

export default function SetupDemoPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(true);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const { getToken } = useAuth();

  const [messages, setMessages] = useState<Array<{ text: string; shown: boolean }>>([
    { text: "Hi, welcome to Inferable.", shown: true },
    { text: "We're going to create an Inferable cluster for you.", shown: false },
    {
      text: "A cluster is a container for your functions (tools) and the agents that use them.",
      shown: false,
    },
    { text: "Creating your cluster...", shown: false },
  ]);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];

    // Show second message after 2 seconds
    timeouts.push(
      setTimeout(() => {
        setMessages(prev => prev.map((msg, i) => (i === 1 ? { ...msg, shown: true } : msg)));
      }, 2000)
    );

    // Show third message after 5 seconds
    timeouts.push(
      setTimeout(() => {
        setMessages(prev => prev.map((msg, i) => (i === 2 ? { ...msg, shown: true } : msg)));
      }, 5000)
    );

    // Show creating message after 7 seconds
    timeouts.push(
      setTimeout(() => {
        setMessages(prev => prev.map((msg, i) => (i === 3 ? { ...msg, shown: true } : msg)));
        // Only start cluster creation after showing the creating message
        createCluster();
      }, 7000)
    );

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const createCluster = useCallback(() => {
    const toastId = toast.loading("Setting up your demo cluster...");

    // Create the cluster
    getToken().then(token => {
      const description = `Created as a demo cluster on ${new Date().toLocaleDateString()}`;

      client
        .createCluster({
          headers: {
            authorization: `Bearer ${token}`,
          },
          body: {
            name: `My Demo`,
            description,
            isDemo: true,
          },
        })
        .then(() => {
          // Wait for 2 seconds before checking the cluster
          return new Promise(resolve => setTimeout(resolve, 2000));
        })
        .then(() => {
          // Get the latest cluster to get its ID
          return client.listClusters({
            headers: {
              authorization: `Bearer ${token}`,
            },
          });
        })
        .then(clusters => {
          if (clusters.status === 200) {
            const latestCluster = clusters.body.sort(
              (a: { createdAt: Date }, b: { createdAt: Date }) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];

            setClusterId(latestCluster.id);
            setIsCreating(false);
            toast.dismiss(toastId);
            toast.success("Demo cluster created successfully!");
          }
        })
        .catch(error => {
          console.error("Failed to create demo cluster:", error);
          createErrorToast(error, "Failed to create demo cluster");
          toast.dismiss(toastId);
          router.push("/clusters");
        });
    });

    return () => {
      toast.dismiss(toastId);
    };
  }, [router, getToken]);

  return (
    <>
      <Header />
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">Welcome to Inferable</h1>
        </div>

        <div className="space-y-6 max-w-2xl">
          <div className="space-y-3">
            {messages.map(
              (message, index) =>
                message.shown && (
                  <div
                    key={index}
                    className="animate-fade-in opacity-0 flex items-center gap-2"
                    style={{ animationDelay: "0s" }}
                  >
                    <p className="text-sm text-gray-700">{message.text}</p>
                    {index === 3 && isCreating && (
                      <div className="h-4 w-4 animate-spin">
                        <svg className="text-gray-500" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                )
            )}
          </div>

          {!isCreating && (
            <>
              <div>
                <div className="rounded-xl bg-white p-4 shadow-sm border border-border/50 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Brain size={18} className="text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Inferable</div>
                      <div className="text-xs text-muted-foreground">just now</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-secondary/10 rounded-lg p-4">
                      <p className="text-sm">
                        Your cluster has been created successfully! Here are the details:
                      </p>
                    </div>

                    <div className="bg-secondary/5 rounded-lg p-4 border border-border/50">
                      <div className="text-sm font-medium mb-2 text-muted-foreground">
                        Cluster Details
                      </div>
                      <pre className="text-xs">
                        {JSON.stringify(
                          {
                            id: clusterId,
                            name: "My Demo",
                            description: `Created as a demo cluster on ${new Date().toLocaleDateString()}`,
                            isDemo: true,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-start mt-6">
                <Button
                  size="sm"
                  onClick={() => router.push(`/clusters/${clusterId}/runs?onboarding=true`)}
                >
                  Go to my new cluster
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fadeIn 1s ease-in forwards;
        }
      `}</style>
    </>
  );
}
