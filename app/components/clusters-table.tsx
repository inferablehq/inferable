"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SortingState } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpDown, Calendar, Eye, Layers, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateClusterButton } from "./create-cluster-button";

export type ClusterData = {
  id: string;
  name: string;
  createdAt: Date;
  description: string | null;
};

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
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Filter clusters based on search term
  const filteredClusters = clusters.filter(
    cluster =>
      cluster.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cluster.description &&
        cluster.description.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  // Sort clusters based on current sorting state
  const sortedClusters = [...filteredClusters].sort((a, b) => {
    const sortField = sorting[0]?.id || "createdAt";
    const sortDirection = sorting[0]?.desc ? -1 : 1;

    if (sortField === "createdAt") {
      return (
        sortDirection *
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    } else if (sortField === "name") {
      return sortDirection * a.name.localeCompare(b.name);
    }
    return 0;
  });

  return (
    <div className="flex gap-6">
      {/* Left Sidebar */}
      <div className="w-80 shrink-0 space-y-4">
        <Card className="bg-white border border-gray-200 rounded-xl transition-all duration-200">
          <CardHeader>
            <CardTitle>Clusters</CardTitle>
            <CardDescription>
              Clusters are groups of workflows. No data is shared between
              clusters, allowing you to isolate different environments or
              projects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <CreateClusterButton label="Create Cluster" variant="default" />
              <hr />
              <div className="mt-4">
                <label className="text-sm text-muted-foreground mb-2 block">
                  Search Clusters
                </label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Sort By
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSorting([
                        {
                          id: "name",
                          desc:
                            sorting[0]?.id === "name"
                              ? !sorting[0].desc
                              : false,
                        },
                      ])
                    }
                    className={`flex items-center gap-1 flex-1 ${sorting[0]?.id === "name" ? "bg-gray-100" : ""}`}
                  >
                    Name
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSorting([
                        {
                          id: "createdAt",
                          desc:
                            sorting[0]?.id === "createdAt"
                              ? !sorting[0].desc
                              : true,
                        },
                      ])
                    }
                    className={`flex items-center gap-1 flex-1 ${sorting[0]?.id === "createdAt" ? "bg-gray-100" : ""}`}
                  >
                    Date
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-4">
        {sortedClusters.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-white border border-gray-200 rounded-xl p-6">
            No clusters found. Try adjusting your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedClusters.map(cluster => (
              <div
                key={cluster.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3
                    className="font-semibold text-lg truncate"
                    title={cluster.name}
                  >
                    {cluster.name}
                  </h3>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span title={new Date(cluster.createdAt).toLocaleString()}>
                      {formatDistanceToNow(new Date(cluster.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </Badge>
                </div>

                <p
                  className="text-sm text-gray-600 mb-3 line-clamp-2"
                  title={cluster.description || ""}
                >
                  {cluster.description || "No description"}
                </p>

                <div className="flex justify-between items-center">
                  <span
                    className="text-xs font-mono text-gray-400 truncate"
                    title={cluster.id}
                  >
                    ID: {cluster.id}
                  </span>
                  <Button asChild>
                    <Link
                      href={`/clusters/${cluster.id}`}
                      className="flex items-center gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
