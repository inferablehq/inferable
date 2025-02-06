import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatRelative } from "date-fns";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { unpack } from "../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { JsonForm } from "./json-form";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-500">
          Job references could not be displayed. Are you authenticated?
        </div>
      );
    }

    return this.props.children;
  }
}

function JobReferencesContent({
  displayable,
  highlighted,
}: {
  displayable: string;
  highlighted: string;
}) {
  const params = useParams<{ runId: string; clusterId: string }>();
  const { getToken } = useAuth();

  const [references, setReferences] = useState<
    ClientInferResponseBody<typeof contract.listRunReferences, 200>
  >([]);

  const [error, setError] = useState<string | null>(null);

  const fetchJobReferences = useCallback(async () => {
    if (params?.clusterId && params?.runId) {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error("No authentication token available");
        }
        const response = await client.listRunReferences({
          params: {
            clusterId: params.clusterId,
            runId: params.runId,
          },
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            token: displayable,
            before: new Date().toISOString(),
          },
        });

        if (response.status === 200) {
          setReferences(response.body);
        } else {
          throw new Error(`Failed to get job references: ${response.status}`);
        }
      } catch (error) {
        console.error("Error fetching job references:", error);
        setError("Failed to fetch job references. Please try again later.");
      }
    } else {
      setError("Missing cluster ID or Run ID");
    }
  }, [params?.clusterId, params?.runId, displayable, getToken]);

  useEffect(() => {
    fetchJobReferences();
  }, [fetchJobReferences]);

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <>
      <h1 className="text-xl">References ({references?.length})</h1>
      {references?.map((e, i) => (
        <div key={e.id} className="mt-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg">Reference #{i + 1}</CardTitle>
              <CardDescription className="mb-4">
                <p>
                  Agent received this data <u>{formatRelative(e.createdAt, new Date())}</u> from{" "}
                  <u>{e.targetFn}</u> executing on machine <u>{e.executingMachineId}</u>.
                </p>
              </CardDescription>
            </CardHeader>
            <CardContent className="-mt-4">
              <JsonForm key={e.id} label={``} value={unpack(e.result)} highlighted={highlighted} />
            </CardContent>
          </Card>
        </div>
      ))}
      {!references?.length && <div className="text-gray-500">No references found</div>}
    </>
  );
}

export function JobReferences(props: { displayable: string; highlighted: string }) {
  return (
    <ErrorBoundary>
      <JobReferencesContent {...props} />
    </ErrorBoundary>
  );
}
