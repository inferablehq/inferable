"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, ClipboardCopy } from "lucide-react";
import Link from "next/link";
import { Loading } from "@/components/loading";

interface CryptoKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export default function ValtownIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState<string | null>(null);

  const generateKeyPair = useCallback(async () => {
    const loadingToast = toast.loading("Generating key pair...");
    try {
      const algorithm: RsaHashedKeyGenParams = {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: "SHA-256" },
      };

      const keyPair = await window.crypto.subtle.generateKey(
        algorithm,
        true,
        ["sign"]
      ) as CryptoKeyPair;

      const publicKey = await window.crypto.subtle.exportKey(
        "jwk",
        keyPair.publicKey
      ).then((key) => JSON.stringify(key));

      const privateKey = await window.crypto.subtle.exportKey(
        "jwk",
        keyPair.privateKey
      ).then((key) => JSON.stringify(key));

      toast.dismiss(loadingToast);
      toast.success("Key pair generated successfully");
      setPublicKey(publicKey);
      return { publicKey, privateKey };
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Failed to generate key pair");
      console.error("Key generation error:", error);
      return null;
    }
  }, []);

  const handleSubmit = async () => {
    setError(null);

    // Basic URL validation
    try {
      new URL(endpoint);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    const loadingToast = toast.loading("Saving configuration...");

    // Generate key pair first
    const keys = await generateKeyPair();
    if (!keys) {
      toast.dismiss(loadingToast);
      return;
    }

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
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
        },
      },
    });

    toast.dismiss(loadingToast);
    if (response.status === 200) {
      toast.success("Integration updated");
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
      setPublicKey(response.body.valtown.publicKey || null);
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
            Connect your Valtown Val endpoint to integrate with your function-as-a-service (FaaS) workflow.
            The endpoint must conform to the FaaS specification for proper integration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Val Endpoint URL</label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://myval.web.val.run"
              />
              <p className="text-sm text-gray-500 mt-1">
                The URL endpoint of your Val that will be called for processing
              </p>
              {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
            </div>
            <Button onClick={handleSubmit}>Save Configuration</Button>
          </div>

          {publicKey && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Generated Public Key</label>
                <textarea
                  readOnly
                  className="w-full min-h-[100px] p-2 text-sm font-mono border rounded-md"
                  value={publicKey}
                />
                <p className="text-sm text-gray-500 mt-1">
                  This public key is used to verify message integrity. Share this key with your Val to enable it to verify that requests are genuinely coming from your Inferable cluster.
                </p>
              </div>
              <Button variant="outline" onClick={() => {
                navigator.clipboard.writeText(publicKey);
                toast.success("Copied to clipboard");
              }}><ClipboardCopy className="w-4 h-4 mr-2" /> Copy Public Key</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
