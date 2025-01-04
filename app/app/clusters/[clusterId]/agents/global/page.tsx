"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Loading } from "@/components/loading";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@clerk/nextjs";
import "@mdxeditor/editor/style.css";
import { ClientInferResponseBody } from "@ts-rest/core";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import sanitizeHtml from "sanitize-html";

// Import necessary plugins
export default function Page({ params }: { params: { clusterId: string } }) {
  const { getToken } = useAuth();
  const [clusterContext, setClusterContext] = useState<
    | ClientInferResponseBody<
        typeof contract.getCluster,
        200
      >["additionalContext"]
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activePrompt, setActivePrompt] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [fetched, setFetched] = useState(false);

  const fetchClusterContext = useCallback(async () => {
    const response = await client.getCluster({
      params: { clusterId: params.clusterId },
      headers: { authorization: `Bearer ${await getToken()}` },
    });

    if (response.status === 200) {
      setClusterContext(response.body.additionalContext);
      const sanitizedContent = sanitizeHtml(
        response.body.additionalContext?.current.content ?? ""
      );
      setActivePrompt(sanitizedContent);
      setFetched(true);
    } else {
      throw new Error(`Failed to fetch cluster context: ${response.status}`);
    }

    setError(null);
  }, [params.clusterId, getToken]);

  useEffect(() => {
    fetchClusterContext();
  }, [fetchClusterContext]);

  useEffect(() => {
    const words = activePrompt.trim().split(/\s+/).length;
    setWordCount(words);
  }, [activePrompt]);

  const handleSave = async () => {
    const markdown = activePrompt;
    const currentVersionHasChanged =
      clusterContext?.current.content !== markdown;

    if (!currentVersionHasChanged) {
      toast.error("No changes to save");
      return;
    }

    const currentVersion = Number(
      clusterContext?.history
        .map((version) => version.version)
        .reduce(
          (latest, version) => (version > latest ? version : latest),
          clusterContext.current.version,
        ) ?? 0,
    );

    const history = clusterContext
      ? [
          ...clusterContext.history,
          {
            version: clusterContext.current.version,
            content: clusterContext.current.content,
          },
        ]
          .sort((a, b) => Number(b.version) - Number(a.version))
          .slice(0, 5)
      : [];

    setIsSaving(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("No token available");

      const response = await client.updateCluster({
        params: { clusterId: params.clusterId },
        headers: { authorization: token },
        body: {
          additionalContext: {
            current: {
              version: String(currentVersion + 1),
              content: markdown,
            },
            history,
          },
        },
      });

      if (response.status !== 204) {
        throw new Error("Failed to update cluster context");
      }

      fetchClusterContext();

      toast.success("Cluster context updated successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update cluster context");
    } finally {
      setIsSaving(false);
    }
  };

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!fetched) {
    return <Loading />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Edit Global Context</CardTitle>
          <CardDescription>
            Update your global context. This will be included in all runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clusterContext && (
            <div className="mb-4">
              <p className="text-sm mb-2">Previous Versions</p>
              <div className="flex flex-wrap gap-2">
                {clusterContext.history.map((version, index) => (
                  <Button
                    onClick={() => setActivePrompt(version.content)}
                    key={index}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    v{version.version}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm mb-2">
            Current Version (v{clusterContext?.current.version})
          </p>
          <MarkdownEditor
            markdown={activePrompt}
            onChange={(markdown) => {
              setActivePrompt(markdown);
            }}
          />
          <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
            <div>
              {wordCount} {wordCount === 1 ? "word" : "words"}
              {wordCount > 300 && (
                <span className="ml-2 text-red-500">
                  Warning: Exceeds 300 words
                </span>
              )}
            </div>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
