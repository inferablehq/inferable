"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Loading } from "@/components/loading";
import Nango from "@nangohq/frontend";
import toast from "react-hot-toast";
import { ClientInferResponses } from "@ts-rest/core";
import { contract } from "@/client/contract";

const nango = new Nango();

export default function SlackIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<
    | ClientInferResponses<
        typeof contract.getIntegrations,
        200
      >["body"]["slack"]
    | null
  >(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const [integrationsResponse] = await Promise.all([
      client.getIntegrations({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: clusterId,
        },
      }),
    ]);
    setLoading(false);

    if (integrationsResponse.status === 200) {
      setConnection(integrationsResponse.body?.slack);
    }
  }, [clusterId, getToken]);

  const onSlackConnect = async () => {
    const response = await client.createNangoSession({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: clusterId,
      },
      body: {
        integration: "slack",
      },
    });

    if (response.status !== 200 || !response.body || !response.body.token) {
      toast.error("Failed to connect to Slack");
      return;
    }

    nango.openConnectUI({
      sessionToken: response.body.token,
      onEvent: async (event) => {
        if (event.type === "connect") {
          toast.success("Connected to Slack");
          // Best effort refresh, hopefully the connection will be there on reload
          setTimeout(() => {
            fetchConfig();
          }, 2000);
        }
      },
    });
  };

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/clusters/${clusterId}/integrations`}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to integrations
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🛠️</span>
            <CardTitle>Configure Slack</CardTitle>
          </div>
          <CardDescription>
            Connect your Slack workspace to trigger runs in this Cluster. For
            more information, see{" "}
            <a
              href="https://docs.inferable.ai/pages/slack"
              target="_blank"
              className="underline"
            >
              our docs
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connection ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <p className="text-gray-500 text-md font-mono">
                  Slack Connected (Team: {connection?.teamId})
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onSlackConnect}>
                Connect Slack
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
