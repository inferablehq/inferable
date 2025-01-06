"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@clerk/nextjs";
import { truncate } from "lodash";
import { GlobeIcon, PlusIcon, TrashIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

type KnowledgeArtifact = {
  id: string;
  data: string;
  tags: string[];
  title: string;
  similarity?: number;
};

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { getToken } = useAuth();
  const params = useParams();
  const router = useRouter();
  const clusterId = params?.clusterId as string;
  const [artifacts, setArtifacts] = useState<KnowledgeArtifact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [bulkUploadJson, setBulkUploadJson] = useState("");

  const fetchArtifacts = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await client.listKnowledgeArtifacts({
        params: { clusterId },
        headers: { authorization: token as string },
        query: { query: searchQuery, limit: 20 },
      });

      if (response.status === 200) {
        setArtifacts(response.body);
      }
    } catch (error) {
      console.error("Error fetching artifacts:", error);
      toast.error("Failed to fetch knowledge artifacts");
    }
  }, [getToken, clusterId, searchQuery]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  const handleSearch = () => {
    fetchArtifacts();
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      const response = await client.deleteKnowledgeArtifact({
        params: { clusterId, artifactId: id },
        headers: { authorization: token as string },
      });

      if (response.status === 204) {
        toast.success("Knowledge artifact deleted successfully");
        fetchArtifacts();
      }
    } catch (error) {
      console.error("Error deleting artifact:", error);
      toast.error("Failed to delete knowledge artifact");
    }
  };

  const handleBulkUpload = async () => {
    try {
      const artifacts = JSON.parse(bulkUploadJson);
      if (!Array.isArray(artifacts)) {
        throw new Error("Invalid JSON format. Expected an array of artifacts.");
      }

      const loading = toast.loading("Uploading knowledge artifacts...");

      const token = await getToken();
      let successCount = 0;
      let failCount = 0;

      for (const artifact of artifacts) {
        try {
          const response = await client.upsertKnowledgeArtifact({
            params: { clusterId, artifactId: artifact.id },
            headers: { authorization: token as string },
            body: artifact,
          });

          if (response.status === 201) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error("Error creating artifact:", error);
          failCount++;
        }
      }

      toast.remove(loading);
      toast.success(
        `Bulk upload completed. Success: ${successCount}, Failed: ${failCount}`,
      );
      setIsUploadDialogOpen(false);
      fetchArtifacts();
    } catch (error) {
      console.error("Error parsing JSON:", error);
      toast.error(
        "Failed to parse JSON. Please check the format and try again.",
      );
    }
  };

  return (
    <div className="flex space-x-4 p-6 text-sm">
      <div className="flex flex-col">
        <div className="flex flex-row space-x-2 items-center justify-between mb-2">
          <div className="flex flex-row space-x-2 justify-between w-full">
            <Link href={`/clusters/${clusterId}/prompts/global`}>
              <Button size="sm">
                <GlobeIcon className="h-4 w-4 mr-2" />
                Global Context
              </Button>
            </Link>
            <div className="flex flex-row space-x-1">
              <Button
                variant="secondary"
                onClick={() =>
                  router.push(`/clusters/${clusterId}/knowledge/new`)
                }
                size="sm"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                New
              </Button>
              <Dialog
                open={isUploadDialogOpen}
                onOpenChange={setIsUploadDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <UploadIcon className="h-4 w-4 mr-2" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bulk Upload Knowledge Artifacts</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col space-y-4">
                    <p className="text-sm text-gray-500">
                      Paste your JSON array of knowledge artifacts below. Note
                      that items with the same ID will be overwritten.
                    </p>
                    <Textarea
                      value={bulkUploadJson}
                      onChange={(e) => setBulkUploadJson(e.target.value)}
                      placeholder='[{"id": "1", "title": "Example", "data": "Content", "tags": ["tag1", "tag2"]}]'
                      rows={10}
                    />
                    <Button onClick={handleBulkUpload}>Upload</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
        <ScrollArea className="border-b-2 border p-2 h-full rounded-md overflow-y-auto h-[calc(100vh-16rem)]">
          <div className="flex mb-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artifacts..."
              className="mr-2"
            />
            <Button variant="secondary" onClick={handleSearch}>
              Search
            </Button>
          </div>
          <div className="flex flex-col space-y-2">
            {artifacts.map((artifact) => (
              <ArtifactPill
                key={artifact.id}
                artifact={artifact}
                onSelect={() =>
                  router.push(
                    `/clusters/${clusterId}/knowledge/${artifact.id}/edit`,
                  )
                }
                onDelete={() => handleDelete(artifact.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="w-9/12">{children}</div>
    </div>
  );
}

function ArtifactPill({
  artifact,
  onSelect,
  onDelete,
}: {
  artifact: KnowledgeArtifact;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const tagColor = generateColorFromString(artifact.tags.sort().join(","));

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] gap-3 items-start hover:bg-gray-50 border p-4 rounded-md shadow-sm text-slate-600 bg-white cursor-pointer mt-1 w-[400px]"
      onClick={onSelect}
    >
      <div
        className="w-2 h-2 rounded-full mt-1"
        style={{ backgroundColor: tagColor }}
      />
      <div>
        <p className="text-sm font-medium leading-none break-word">
          {truncate(artifact.title, { length: 100 })}
        </p>
        <p className="text-xs text-gray-500 mt-2">{artifact.tags.join(", ")}</p>
      </div>
      <Button
        className="opacity-30 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        size="icon"
        variant="ghost"
      >
        <TrashIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function generateColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`; // Adjusted lightness to 60% for better visibility
}
