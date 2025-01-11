"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Loading } from "@/components/loading";
import Nango from "@nangohq/frontend";
import toast from "react-hot-toast";
import { ClientInferResponses } from "@ts-rest/core";
import { contract } from "@/client/contract";
import { z } from "zod";
import { createErrorToast } from "@/lib/utils";

const nango = new Nango();

// Select component uses this value to represent no agent id
const NO_AGENT_ID_VALUE = "NONE";

const formSchema = z.object({
  agentId: z.string().optional(),
});

export default function SlackIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [connection, setConnection] = useState<
    ClientInferResponses<typeof contract.getIntegrations, 200>["body"]["slack"] | null
  >(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agentId: NO_AGENT_ID_VALUE,
    },
  });

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const [integrationsResponse, agentsResponse] = await Promise.all([
      client.getIntegrations({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: clusterId,
        },
      }),
      client.listAgents({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: clusterId,
        },
      }),
    ]);
    setLoading(false);

    if (agentsResponse.status === 200) {
      setAgents(agentsResponse.body);
    }

    if (integrationsResponse.status === 200) {
      setConnection(integrationsResponse.body?.slack);
      if (integrationsResponse.body?.slack?.agentId) {
        form.setValue("agentId", integrationsResponse.body.slack.agentId);
      }
    }
  }, [clusterId, getToken, form]);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    const response = await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: clusterId,
      },
      body: {
        slack: {
          agentId: data.agentId === NO_AGENT_ID_VALUE ? undefined : data.agentId,
          // These are not editable, they will be ignored by the backend
          nangoConnectionId: "",
          botUserId: "",
          teamId: "",

        },
      },
    });

    if (response.status === 200) {
      toast.success("Integration updated");
      await fetchConfig();
    } else {
      createErrorToast(response, "Error updating integration");
    }
  };

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
      onEvent: async event => {
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
            Connect your Slack workspace to trigger runs in this Cluster. For more information, see{" "}
            <a href="https://docs.inferable.ai/pages/slack" target="_blank" className="underline">
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

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="agentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agent</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an agent" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_AGENT_ID_VALUE}>None (Use Cluster Defaults)</SelectItem>
                            {agents.map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select an agent to handle Slack messages, or leave empty to use cluster defaults
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit">Save Configuration</Button>
                </form>
              </Form>
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
