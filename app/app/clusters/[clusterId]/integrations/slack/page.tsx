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
import Nango from '@nangohq/frontend';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const nango = new Nango();

export default function SlackIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const response = await client.getIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: clusterId,
      },
    });
    setLoading(false);

    if (response.status === 200) {
      setSessionToken(response.body?.slack?.nangoSessionToken ?? null);
      setConnectionId(response.body?.slack?.nangoConnectionId ?? null);
    }

  }, [clusterId, getToken]);

  const onSlackConnect = async () => {
    if (!sessionToken) {
      return;
    }

    nango.openConnectUI({
      sessionToken: sessionToken,
      onEvent: async (event) => {
        if (event.type === "connect") {
          toast.success("Connected to Slack");
          router.push(`/clusters/${clusterId}/integrations`);
        }
      }
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
            Connect your Slack workspace to trigger runs in this Cluster.
            For more information, see{" "}
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
          {sessionToken ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={onSlackConnect}
              >
                Connect Slack
              </Button>
            </div>
          ) : null}
          {connectionId ? (
            <div className="flex items-center gap-2">
              <h3 className="text-gray-500">Connected ({connectionId})</h3>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
