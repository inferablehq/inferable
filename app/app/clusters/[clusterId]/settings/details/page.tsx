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
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { Loading } from "@/components/loading";
import { useRouter } from "next/navigation";
import Link from "next/link";

const formSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  debug: z.boolean().default(false),
  enableCustomAuth: z.boolean().default(false),
  handleCustomAuthFunction: z.string().default(""),
});

export default function DetailsPage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const fetchClusterDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const details = await client.getCluster({
        headers: { authorization: `Bearer ${await getToken()}` },
        params: { clusterId },
      });

      if (details.status === 200) {
        form.setValue("name", details.body.name);
        form.setValue("description", details.body.description ?? "");
        form.setValue("debug", details.body.debug ?? false);
        form.setValue(
          "enableCustomAuth",
          details.body.enableCustomAuth ?? false,
        );
        form.setValue(
          "handleCustomAuthFunction",
          details.body.handleCustomAuthFunction ?? "",
        );
      } else {
        createErrorToast(details, "Failed to fetch cluster details");
      }
    } catch (err) {
      createErrorToast(err, "Failed to fetch cluster details");
    } finally {
      setIsLoading(false);
    }
  }, [clusterId, getToken, form]);

  const updateClusterDetails = useCallback(
    async (data: z.infer<typeof formSchema>) => {
      try {
        const result = await client.updateCluster({
          headers: { authorization: `Bearer ${await getToken()}` },
          params: { clusterId },
          body: {
            name: data.name,
            description: data.description,
            debug: data.debug,
            enableCustomAuth: data.enableCustomAuth,
            handleCustomAuthFunction: data.handleCustomAuthFunction,
          },
        });

        if (result.status === 204) {
          toast.success("Cluster details updated successfully");
          router.refresh();
        } else {
          createErrorToast(result, "Failed to update cluster details");
        }
      } catch (err) {
        createErrorToast(err, "Failed to update cluster details");
      }
    },
    [clusterId, getToken, router],
  );

  useEffect(() => {
    fetchClusterDetails();
  }, [fetchClusterDetails]);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cluster Details</CardTitle>
        <CardDescription>Update the details of the cluster</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(updateClusterDetails)}
            className="space-y-8"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Name of the cluster" {...field} />
                  </FormControl>
                  <FormDescription>
                    The name of the cluster, so you can identify it
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-6">
              <div className="text-lg font-medium">Advanced Settings</div>
              <FormField
                control={form.control}
                name="enableCustomAuth"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Custom Auth</FormLabel>
                      <FormDescription>
                        Allow this cluster to be authenticated with{" "}
                        <Link
                          className="underline"
                          href="https://docs.inferable.ai/pages/custom-auth"
                        >
                          custom authentication tokens
                        </Link>
                        .
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("enableCustomAuth") && (
                <FormField
                  control={form.control}
                  name="handleCustomAuthFunction"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-start justify-between rounded-lg border p-4">
                      <FormLabel>Custom Auth Function Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Name of the custom auth function"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The name of the function that will handle custom
                        authentication for this cluster
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="debug"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Debug Logging</FormLabel>
                      <FormDescription>
                        Allow Inferable to capture additional debug logs for the
                        purpose of troubleshooting.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit">Save</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
