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
import { Eye, Trash2, Settings, Play, ArrowUpDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

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
      )
    },
    cell: ({ row }) => (
      <div className="flex-1">
        <Link href={`/clusters/${row.original.id}`} className="text-gray-900 hover:text-gray-700 text-lg font-semibold">
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
      )
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
          className="h-8 w-8 text-red-600 hover:text-red-900"
          onClick={() => {
            // TODO: Implement delete functionality
            console.log('Delete cluster:', row.original.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ),
  },
];

interface ClustersTableProps {
  clusters: ClusterData[];
}

export function ClustersTable({ clusters }: ClustersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  return (
    <div>
      <div className="mb-4">
        <Input
          placeholder="Filter clusters..."
          value={(columnFilters[0]?.value as string) ?? ""}
          onChange={(event) =>
            setColumnFilters([
              {
                id: "name",
                value: event.target.value,
              },
            ])
          }
          className="max-w-sm"
        />
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
