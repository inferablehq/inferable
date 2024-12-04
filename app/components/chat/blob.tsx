import { client } from "@/client/client";
import { BlobDetails } from "@/lib/types";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { ReadOnlyJSON } from "../read-only-json";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { formatRelative } from "date-fns";

// 50kb
const MAX_RENDER_SIZE_BYTES = 5 * 1024;

export function Blob({
  blob,
  clusterId,
}: {
  blob: BlobDetails;
  clusterId: string;
}) {
  const { getToken } = useAuth();
  const [fetching, setFetching] = useState(true);
  const [data, setData] = useState<string | null>(null);
  const [oversize, setOversize] = useState(false);

  const fetchBlobData = useCallback(async () => {
    const response = await client.getBlobData({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        blobId: blob.id,
        clusterId,
      },
    });

    if (response.status === 200) {
      setData(response.body);
    }
    setFetching(false);
  }, [blob.id, clusterId, getToken]);

  const downloadBlob = useCallback(async () => {
    if (!data) return;

    const buffer = new TextEncoder().encode(atob(data));
    const base64Data = btoa(String.fromCharCode(...Array.from(buffer)));

    const dataUri = `data:${blob.type};base64,${base64Data}`;

    const a = document.createElement("a");
    a.href = dataUri;
    a.download = blob.name;

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);

  }, [data, blob.name, blob.type]);

  useEffect(() => {
    fetchBlobData();
    if (blob.type?.includes("json") && blob.size > MAX_RENDER_SIZE_BYTES) {
      setOversize(true);
      return;
    }
  }, [blob.id, blob.name, blob.type, blob.size, fetchBlobData]);

  return (
    <Card className="ml-4 mb-4 mr-4">
      <CardHeader>
        <CardTitle className="flex items-center font-semibold text-md">
          <div className="flex flex-row space-x-2">
            <p>Blob: {blob.name}</p>
            <p className="text-muted-foreground font-normal">
              {formatRelative(blob.createdAt, new Date())}
            </p>
          </div>
        </CardTitle>
        <CardDescription>
          <p>
            This result was returned as a <a href="https://docs.inferable.ai/pages/blobs" className="underline">Blob</a>. The model did not recieve this data and can not make inferences about it.
          </p>
            {data && oversize && (
            <p className="mt-2">
              Result was too large to render.
            </p>
            )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col space-y-4">
        {data && !oversize && blob.type === "application/json" && (
          <div className="text-xs text-muted-foreground mb-2">
            <ReadOnlyJSON
              json={JSON.stringify(
                JSON.parse(Buffer.from(data, "base64").toString()),
                null,
                2,
              )}
            />
          </div>
        )}
        {data && !oversize && blob.type === "image/png" && (
          <img
            className="w-1/2 mx-auto"
            src={`data:image/png;base64,${data}`}
            alt={blob.name}
          />
        )}
      </CardContent>
      {data && (
        <Button
          className="ml-6 mb-5"
          onClick={() => {
            downloadBlob();
          }}
        >
          Download { blob.name } ({blob.type})
        </Button>
      )}
    </Card>
  );
}
