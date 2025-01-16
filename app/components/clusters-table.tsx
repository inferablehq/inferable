"use client";

import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import Link from "next/link";
import { Eye, Trash2, Settings, Play, ArrowUpDown, Brain, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { CreateClusterButton } from "./create-cluster-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ClusterData = {
  id: string;
  name: string;
  createdAt: Date;
  description: string | null;
};

const columns: ColumnDef<ClusterData>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="-ml-4 h-8 data-[sorting=true]:text-gray-900"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="flex-1">
        <Link
          href={`/clusters/${row.original.id}`}
          className="text-gray-900 hover:text-gray-700 text-lg font-semibold"
        >
          {row.getValue("name")}
        </Link>
        <div className="text-sm text-gray-500 truncate mt-1" title={row.original.description || ""}>
          {row.original.description || "No description"}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="-ml-4 h-8 data-[sorting=true]:text-gray-900"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt"));
      return (
        <span title={date.toLocaleString()} className="text-gray-600 whitespace-nowrap">
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="flex justify-end items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-gray-600 hover:text-gray-900"
        >
          <Link href={`/clusters/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-gray-600 hover:text-gray-900"
        >
          <Link href={`/clusters/${row.original.id}/settings`}>
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-gray-600 hover:text-gray-900"
        >
          <Link href={`/clusters/${row.original.id}/runs`}>
            <Play className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-red-600 hover:text-red-900"
        >
          <Link href={`/clusters/${row.original.id}/settings/danger`}>
            <Trash2 className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    ),
  },
];

interface ClustersTableProps {
  clusters: ClusterData[];
}

export function ClustersTable({ clusters }: ClustersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "createdAt",
      desc: true,
    },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900">
          <Brain className="w-4 h-4 inline-block mr-2" />
          Create your first cluster
        </h3>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Get started by creating your first cluster to organize your functions and runs.
        </p>
        <div className="mt-6 flex gap-4 justify-center">
          <Popover defaultOpen>
            <PopoverTrigger asChild>
              <Button asChild variant="default">
                <Link href="/setup-demo">
                  Quick Start <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
              <div className="text-sm font-medium">
                👋 New to Inferable?
                <p className="font-normal text-muted-foreground mt-1">
                  We strongly recommend starting with our demo cluster!
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <CreateClusterButton label="Create empty cluster" variant="outline" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <Input
          placeholder="Filter clusters..."
          value={(columnFilters[0]?.value as string) ?? ""}
          onChange={event =>
            setColumnFilters([
              {
                id: "name",
                value: event.target.value,
              },
            ])
          }
          className="max-w-sm"
        />
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button asChild variant="outline">
                <Link href="/setup-demo">
                  Quick Start <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
              <div className="text-sm font-medium">
                👋 New to Inferable?
                <p className="font-normal text-muted-foreground mt-1">
                  We strongly recommend starting with our demo cluster!
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <CreateClusterButton label="Create Cluster" variant="default" />
        </div>
      </div>
      <DataTable
        columns={columns}
        data={clusters}
        sorting={sorting}
        columnFilters={columnFilters}
        onSortingChange={setSorting}
        onColumnFiltersChange={setColumnFilters}
      />
    </div>
  );
}
