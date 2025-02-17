"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { client } from "@/client/client";
import { useAuth } from "@clerk/nextjs";
import { createErrorToast } from "@/lib/utils";
import toast from "react-hot-toast";
import { ClientInferResponseBody } from "@ts-rest/core";
import { contract } from "@/client/contract";

type Workflow = ClientInferResponseBody<typeof contract.listWorkflows, 200>[number];

const WorkflowInputForm = ({
  schema,
  onSubmit
}: {
  schema: z.ZodObject<any>,
  onSubmit: (data: any) => void
}) => {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: Object.keys(schema.shape).reduce((acc, key) => {
      acc[key] = key === 'executionId'
        ? crypto.randomUUID()
        : (schema.shape[key] instanceof z.ZodBoolean ? false : undefined);
      return acc;
    }, {} as any)
  });

  const handleSubmit = (data: any) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {Object.entries(schema.shape).map(([key, zodType]) => (
          <FormField
            key={key}
            control={form.control}
            name={key}
            render={({ field }) => (
              <FormItem className="space-y-2">
                <div className="flex flex-col">
                  <FormLabel className="mb-2">{key}</FormLabel>
                  <FormControl>
                    {key === 'executionId' ? (
                      <div className="relative">
                        <Input
                          {...field}
                          placeholder="Custom execution ID (optional)"
                        />
                      </div>
                    ) : zodType instanceof z.ZodBoolean ? (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    ) : (
                      <Input
                        {...field}
                        type={typeof field.value === 'number' ? 'number' : 'text'}
                        onChange={(e) => {
                          const value = typeof field.value === 'number'
                            ? Number(e.target.value)
                            : e.target.value;
                          field.onChange(value);
                        }}
                      />
                    )}
                  </FormControl>
                  { (zodType as any).description && <FormDescription>{(zodType as any).description}</FormDescription> }
                  { key === "executionId" && <FormDescription>Unique execution ID, if none provided a random one will be generated</FormDescription> }
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <Button type="submit" className="w-full">
          Start Workflow
        </Button>
      </form>
    </Form>
  );
};

export const WorkflowTriggerModal = ({
  clusterId,
  onTrigger
}: {
    clusterId: string,
    onTrigger?: () => void
  }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const token = await getToken();
        const result = await client.listWorkflows({
          headers: { authorization: `Bearer ${token}` },
          params: { clusterId }
        });

        if (result.status === 200) {
          setWorkflows(result.body);
        }
      } catch (error) {
        console.error("Failed to fetch workflows", error);
      }
    };

    fetchWorkflows();
  }, [clusterId, getToken]);

  const handleWorkflowSelect = (workflowName: string) => {
    const workflow = workflows.find(w => w.name === workflowName);
    setSelectedWorkflow(workflow || null);
  };

  const handleSubmit = async (data: any) => {
    if (!selectedWorkflow) return;

    setIsLoading(true);
    try {
      const token = await getToken();
      const response = await client.createWorkflowExecution({
        headers: { authorization: `Bearer ${token}` },
        params: {
          clusterId,
          workflowName: selectedWorkflow.name
        },
        body: data
      });

      if (response.status == 201) {
        toast.success("Workflow triggered successfully");
        setIsOpen(false);
        onTrigger?.();
      } else {
        createErrorToast(response, "Failed to trigger workflow");
      }
    } catch (error) {
      createErrorToast(error, "Failed to trigger workflow");
    } finally {
      setIsLoading(false);
    }
  };

  const renderWorkflowForm = () => {
    if (!selectedWorkflow?.schema) return null;

    try {
      const parsedSchema = JSON.parse(selectedWorkflow.schema);
      const zodSchema = buildFormSchema(parsedSchema);

      return <WorkflowInputForm
        schema={zodSchema}
        onSubmit={handleSubmit}
      />;
    } catch (error) {
      if (error instanceof Error) {
        return <p>Unable to render workflow input form:<pre>{error.message}</pre></p>;
      } else {
        return <p>Unable to render workflow input form</p>;
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full" disabled={isLoading}>
          {isLoading ? "Triggering..." : "Trigger Workflow"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trigger Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select
            value={selectedWorkflow?.name || ""}
            onValueChange={handleWorkflowSelect}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a workflow" />
            </SelectTrigger>
            <SelectContent>
              {workflows.map(workflow => (
                <SelectItem
                  key={`${workflow.name}-${workflow.version}`}
                  value={workflow.name}
                >
                  {workflow.name} (v{workflow.version})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedWorkflow && (
            <div>
              {selectedWorkflow.description && (
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedWorkflow.description}
                </p>
              )}
              {renderWorkflowForm()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const buildFormSchema = (jsonSchema: any): z.ZodObject<any> => {
  const properties = jsonSchema.properties || {};
  const requiredFields = jsonSchema.required || [];

  const schemaFields: { [key: string]: z.ZodTypeAny } = {
    executionId: z.string().optional(),
  };

  Object.entries(properties).forEach(([key, prop]: [string, any]) => {
    switch (prop.type) {
      case 'string':
        let stringSchema = z.string().describe(prop.description);
        if (prop.minLength) stringSchema = stringSchema.min(prop.minLength);
        if (prop.maxLength) stringSchema = stringSchema.max(prop.maxLength);
        if (requiredFields.includes(key)) stringSchema = stringSchema.nonempty('This field is required');
        schemaFields[key] = stringSchema;
        break;
      case 'number':
        let numberSchema = z.number().describe(prop.description);
        if (prop.minimum !== undefined) numberSchema = numberSchema.min(prop.minimum);
        if (prop.maximum !== undefined) numberSchema = numberSchema.max(prop.maximum);
        if (requiredFields.includes(key)) numberSchema = z.number({
          required_error: 'This field is required',
          invalid_type_error: 'This field is required'
        });
        schemaFields[key] = numberSchema;
        break;
      case 'boolean':
        let booleanSchema = z.boolean().describe(prop.description);
        if (requiredFields.includes(key)) booleanSchema = z.boolean({
          required_error: 'This field is required',
          invalid_type_error: 'This field is required'
        });
        schemaFields[key] = booleanSchema;
        break;
      default:
        throw new Error(`Unsupported type: ${prop.type}`);
    }
  });

  return z.object(schemaFields);
};
