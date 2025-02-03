"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { ArrowLeft, ClipboardCopy } from "lucide-react";
import Link from "next/link";
import { Loading } from "@/components/loading";
import { Input } from "@/components/ui/input";
import { createErrorToast } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

const formSchema = z.object({
  validateSPFandDKIM: z.boolean().optional().default(false),
});

// TODO: pull this into env vars
const EMAIL_INGESTION_SUFIX = `run.inferable.ai`;

// The integrations endpoint uses this magic value to generate a new connection
const NEW_CONNECTION_ID_VALUE = "NEW";

export default function EmailIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    const response = await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId: clusterId,
      },
      body: {
        email: {
          connectionId: connectionId ?? NEW_CONNECTION_ID_VALUE,
          validateSPFandDKIM: data.validateSPFandDKIM,
        },
      },
    });

    if (response.status === 200) {
      toast.success("Integration updated");
      await fetchConfig();
      return;
    } else {
      createErrorToast(response, "Error updating integration");
    }
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);

    const [integrationsResponse] = await Promise.all([
      client.getIntegrations({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: clusterId,
        },
      }),
    ]);

    setLoading(false);

    if (integrationsResponse.status === 200 && integrationsResponse.body?.email) {
      form.setValue(
        "validateSPFandDKIM",
        integrationsResponse.body.email.validateSPFandDKIM ?? false
      );
      setConnectionId(integrationsResponse.body.email.connectionId || null);
    }
  }, [clusterId, getToken, form]);

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
            <span className="text-2xl">📧</span>
            <CardTitle>Configure Email Integration</CardTitle>
          </div>
          <CardDescription>
            Configure email integration settings for this cluster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <div className="mb-6 space-y-4">
              <div>
                <FormLabel>Email Address</FormLabel>
                <div className="flex gap-2 items-center">
                  <Input
                    readOnly
                    value={
                      !!connectionId
                        ? `${connectionId}@${EMAIL_INGESTION_SUFIX}`
                        : "Email address will be generated on save"
                    }
                    className="font-mono"
                  />

                  {!!connectionId && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(`${connectionId}@${EMAIL_INGESTION_SUFIX}`);
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <ClipboardCopy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="validateSPFandDKIM"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Validate SPF and DKIM</FormLabel>
                      <FormDescription>
                        Validate the sender&apos;s email address using SPF and DKIM
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit">Save Configuration</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
