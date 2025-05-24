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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  debug: z.boolean().default(false),
  eventExpiryAge: z.number().nullable().optional(),
  runExpiryAge: z.number().nullable().optional(),
  workflowExecutionExpiryAge: z.number().nullable().optional(),
});

// Define expiry options in seconds
const expiryOptions = [
  { value: null, label: "No expiry" },
  { value: 60, label: "1 minute" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "1 day" },
  { value: 604800, label: "1 week" },
];

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
        // Convert number/null value from API to the corresponding value for the select
        form.setValue("eventExpiryAge", details.body.eventExpiryAge ?? null);
        form.setValue("runExpiryAge", details.body.runExpiryAge ?? null);
        form.setValue(
          "workflowExecutionExpiryAge",
          details.body.workflowExecutionExpiryAge ?? null,
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
            // Pass the number/null value directly to the API
            eventExpiryAge: data.eventExpiryAge ?? undefined,
            runExpiryAge: data.runExpiryAge ?? undefined,
            workflowExecutionExpiryAge:
              data.workflowExecutionExpiryAge ?? undefined,
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

              {/* Event Expiry Age Select */}
              <FormField
                control={form.control}
                name="eventExpiryAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Expiry Age</FormLabel>
                    <Select
                      onValueChange={value =>
                        field.onChange(value === "null" ? null : Number(value))
                      }
                      value={
                        field.value === null ? "null" : String(field.value)
                      } // Convert number/null to string for Select
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expiry age" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expiryOptions.map(option => (
                          <SelectItem
                            key={option.value}
                            value={String(option.value)}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How long events should be kept for this cluster.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Run Expiry Age Select */}
              <FormField
                control={form.control}
                name="runExpiryAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Run Expiry Age</FormLabel>
                    <Select
                      onValueChange={value =>
                        field.onChange(value === "null" ? null : Number(value))
                      }
                      value={
                        field.value === null ? "null" : String(field.value)
                      } // Convert number/null to string for Select
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expiry age" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expiryOptions.map(option => (
                          <SelectItem
                            key={option.value}
                            value={String(option.value)}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How long runs should be kept for this cluster.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Workflow Execution Expiry Age Select */}
              <FormField
                control={form.control}
                name="workflowExecutionExpiryAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workflow Execution Expiry Age</FormLabel>
                    <Select
                      onValueChange={value =>
                        field.onChange(value === "null" ? null : Number(value))
                      }
                      value={
                        field.value === null ? "null" : String(field.value)
                      } // Convert number/null to string for Select
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expiry age" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expiryOptions.map(option => (
                          <SelectItem
                            key={option.value}
                            value={String(option.value)}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How long workflow executions should be kept for this
                      cluster.
                    </FormDescription>
                    <FormMessage />
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
