"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, ClipboardCopy } from "lucide-react";
import Link from "next/link";
import { Loading } from "@/components/loading";

export default function ValtownIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateToken = useCallback(async () => {
    return `sk-inf-val-${window.crypto.randomUUID()}`;
  }, []);

  const handleSubmit = async (shouldRegenerateToken: boolean = false) => {
    setError(null);

    // Basic URL validation
    try {
      const url = new URL(endpoint);
      if (!url.hostname.endsWith("val.run")) {
        setError("Please enter a valid Val endpoint URL (must end with val.run)");
        return;
      }
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    const loadingToast = toast.loading("Saving configuration...");

    const newToken = shouldRegenerateToken ? await generateToken() : token;

    const response = await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: clusterId,
      },
      body: {
        valtown: {
          endpoint,
          token: newToken ?? (await generateToken()),
        },
      },
    });

    toast.dismiss(loadingToast);
    if (response.status === 200) {
      toast.success(shouldRegenerateToken ? "Token regenerated" : "Integration updated");
      await fetchConfig();
      return;
    } else {
      createErrorToast(response, "Failed to update integration");
    }
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const response = await client.getIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: clusterId,
      },
    });
    setLoading(false);

    if (response.status === 200 && response.body?.valtown) {
      setEndpoint(response.body.valtown.endpoint || "");
      setToken(response.body.valtown.token || null);
    }
  }, [clusterId, getToken]);

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
            <span className="text-2xl">🏃</span>
            <CardTitle>Configure Valtown</CardTitle>
          </div>
          <CardDescription>
            <p>
              Connect your Valtown Val endpoint to integrate with your function-as-a-service (FaaS)
              workflow. Use the `jsr:@inferable/valtown-adapter` package to build your Val. For full
              documentation, visit{" "}
              <a
                href="https://docs.inferable.ai/pages/valtown"
                className="text-blue-500 hover:underline"
              >
                https://docs.inferable.ai/pages/valtown
              </a>
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Val Endpoint URL</label>
              <Input
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
                placeholder="https://myval.web.val.run"
              />
              <p className="text-sm text-gray-500 mt-1">
                The URL endpoint of your Val that will be called for processing
              </p>
              {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
            </div>
            <Button onClick={() => handleSubmit()}>Save Configuration</Button>
          </div>

          {token && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Authentication Token</label>
                <pre className="text-sm text-gray-500 mt-1">
                  {`${token.slice(0, 16)}${token.slice(16).replace(/[A-Za-z0-9]/g, "*")}`}
                </pre>
                <p className="text-sm text-gray-500 mt-1">
                  Use this token to authenticate requests from your Val to Inferable. Keep this
                  token secret and secure.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(token);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <ClipboardCopy className="w-4 h-4 mr-2" /> Copy Token
                </Button>
                <Button variant="outline" onClick={() => handleSubmit(true)}>
                  Regenerate Token
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
