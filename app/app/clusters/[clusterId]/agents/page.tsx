"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { isFeatureEnabled } from "@/lib/features";
import { useAuth } from "@clerk/nextjs";
import { ColumnDef } from "@tanstack/react-table";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpDown, Globe, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Prompt = ClientInferResponseBody<
  typeof contract.listAgents,
  200
>[number];

const columns: ColumnDef<Prompt>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Agent Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="space-y-2 max-w-[800px]">
        <p className="font-medium">{row.getValue("name")}</p>
        <p className="text-sm text-gray-500 line-clamp-2 overflow-hidden text-ellipsis">
          {row.original.initialPrompt}
        </p>
        {row.original.attachedFunctions.filter(Boolean).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.original.attachedFunctions.map((tool) => (
              <span
                key={tool}
                className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full"
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    ),
  },
  {
    id: "id",
    header: "Agent ID",
    cell: ({ row }) => (
      <pre className="text-sm text-gray-500">{row.original.id}</pre>
    ),
  },
  {
    id: "lastUpdated",
    header: "Last Updated",
    cell: ({ row }) => (
      <p className="text-sm text-gray-500">
        {row.original.updatedAt
          ? formatDistanceToNow(new Date(row.original.updatedAt), {
              addSuffix: true,
            })
          : "N/A"}
      </p>
    ),
  },
  {
    id: "actions",
    cell: function Cell({ row }) {
      const [isDeleting, setIsDeleting] = useState(false);
      const { getToken } = useAuth();
      const router = useRouter();

      const handleDelete = async () => {
        if (
          confirm("Are you sure you want to delete this Agent?")
        ) {
          setIsDeleting(true);
          try {
            const token = await getToken();
            if (!token) throw new Error("No token available");

            const response = await client.deleteAgent({
              params: {
                clusterId: row.original.clusterId,
                agentId: row.original.id,
              },
              headers: { authorization: token },
            });

            if (response.status !== 204) {
              throw new Error("Failed to delete Agent");
            } else {
              router.refresh();
            }
          } catch (err) {
            console.error(err);
            alert("An error occurred while deleting the Agent");
          } finally {
            setIsDeleting(false);
          }
        }
      };

      return (
        <div className="flex flex-row gap-2">
          <Button size="sm" asChild>
            <Link
              href={`/clusters/${row.original.clusterId}/runs?agentId=${row.original.id}`}
              target="_blank"
            >
              Run
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link
              href={`/clusters/${row.original.clusterId}/agents/${row.original.id}/edit`}
            >
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      );
    },
  },
];

export default function Page({ params }: { params: { clusterId: string } }) {
  const { getToken } = useAuth();
  const [prompts, setPrompts] = useState<
    ClientInferResponseBody<typeof contract.listAgents, 200>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchPrompts = async () => {
      setIsLoading(true);
      try {
        const token = await getToken();

        const response = await client.listAgents({
          params: { clusterId: params.clusterId },
          headers: { authorization: `Bearer ${token}` },
        });

        if (response.status !== 200) {
          throw new Error("Failed to fetch agents");
        }

        setPrompts(response.body);
        setError(null);
      } catch (err) {
        setError("An error occurred while fetching agents");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
  }, [params.clusterId, getToken]);

  if (isLoading) {
    return <div>Loading Agents...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="ml-0 max-w-[1200px]">
      <h1 className="text-xl">Agents</h1>
      <div className="flex space-x-4 mb-4">
        <Button
          variant="secondary"
          onClick={() => {
            router.push(`/clusters/${params.clusterId}/agents/new`);
          }}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Create New Agent
        </Button>
        {isFeatureEnabled("feature.cluster_context") && (
          <Button
            variant="secondary"
            onClick={() => {
              router.push(`/clusters/${params.clusterId}/agents/global`);
            }}
          >
            <Globe className="mr-2 h-4 w-4" />
            Global Context
          </Button>
        )}
      </div>
      <DataTable columns={columns} data={prompts} />
    </div>
  );
}
