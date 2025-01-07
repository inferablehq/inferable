"use client";

import { client } from "@/client/client";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contract, integrationSchema } from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import { createErrorToast } from "@/lib/utils";

const EMAIL_DOMAIN = "run.inferable.ai";
const CLUSTER_TARGET_VALUE = "cluster";

export default function EmailIntegrationPage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();

  const [integration, setIntegration] = useState<z.infer<typeof integrationSchema>["email"] | undefined>();
  const [agents, setAgents] = useState<ClientInferResponseBody<typeof contract.listAgents> | undefined>();

  const [loading, setLoading] = useState(true);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);

    const response = await client.getIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId,
      },
    });

    if (response.status !== 200) {
      createErrorToast(response, "Failed to fetch integrations");
      return;
    }

    const agentsResponse = await client.listAgents({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId,
      },
    });

    if (agentsResponse.status !== 200) {
      createErrorToast(agentsResponse, "Failed to fetch agents");
      return;
    }

    setIntegration(response.body.email ?? undefined);
    setAgents(agentsResponse.body);

    setLoading(false);
  }, [clusterId, getToken]);

  const handleAddConnection = useCallback(async (target: string) => {
    const updatedIntegration = integration ?? {
      connections: [],
    };

    if (target === CLUSTER_TARGET_VALUE) {
      updatedIntegration.connections.push({
        destination: {
          type: "cluster",
          id: clusterId
        }
      });
    } else {
      updatedIntegration.connections.push({
        destination: {
          type: "agent",
          id: target,
        }
      });
    }

    const response = await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId,
      },
      body: {
        email: updatedIntegration,
      },
    });

    if (response.status !== 200) {
      createErrorToast(response, "Failed to update integrations");
    }

    fetchIntegrations();
  }, [clusterId, fetchIntegrations, getToken, integration]);

  const handleRemoveConnection = useCallback(async (id: string) => {
    if (!integration) {
      return
    }

    const updatedIntegration = {
      ...integration,
      connections: integration?.connections.filter((c) => c.id !== id)
    }

    const response = await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId,
      },
      body: {
        email: updatedIntegration.connections.length === 0 ? null : updatedIntegration,
      },
    });

    if (response.status !== 200) {
      createErrorToast(response, "Failed to update integrations");
    }

    fetchIntegrations();
  }, [clusterId, fetchIntegrations, getToken, integration]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-8">
      <div>
          <h1 className="text-2xl">Email Connections</h1>
        <p className="text-gray-500 mb-6">
          Configure the email integration for this Cluster by creating connections.
          Each connection will recieive a unique email address which can be connected to the Cluster or an individual Agent.
        </p>

        <EmailConnections
          integration={integration}
          agents={agents}
          handleAddConnection={handleAddConnection}
          handleRemoveConnection={handleRemoveConnection}
        />
      </div>
    </div>
  );
}

interface EmailConnectionsProps {
  integration?: z.infer<typeof integrationSchema>["email"];
  agents: ClientInferResponseBody<typeof contract.listAgents>;
  handleAddConnection: (target: string) => void;
  handleRemoveConnection: (id: string) => void;
}

function EmailConnections({
  integration,
  agents,
  handleAddConnection,
  handleRemoveConnection,
}: EmailConnectionsProps) {

  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  return (
    <div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Email Address</TableHead>
              <TableHead>Connected To</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {integration?.connections.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell className="font-mono">{connection.id}@{EMAIL_DOMAIN}</TableCell>
                <TableCell>
                  {connection.destination.type === CLUSTER_TARGET_VALUE || !connection.destination.id
                    ? 'Cluster'
                    : "Agent: " + agents?.find((a) => a.id === connection.destination.id)?.name || 'Unknown Agent'
                  }
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => connection.id && handleRemoveConnection(connection.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <div className="text-muted-foreground italic">New email will be generated</div>
              </TableCell>
              <TableCell>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Target" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CLUSTER_TARGET_VALUE}>Cluster</SelectItem>
                    <SelectItem value="_divider" disabled>
                      ─────────────
                    </SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        Agent: {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    onClick={() => selectedAgentId && handleAddConnection(selectedAgentId)}
                    disabled={!selectedAgentId}
                    size="sm"
                  >
                    Create
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
