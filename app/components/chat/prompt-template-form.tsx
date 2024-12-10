import React, { useEffect, useRef } from "react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileWarning } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { StructuredOutputEditor } from "./structured-output-editor";
import Link from "next/link";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  initialPrompt: z.string().optional(),
  systemPrompt: z.string().optional(),
  attachedFunctions: z.string(),
  resultSchema: z.string().optional(),
  inputSchema: z.string().optional(),
});

type PromptTemplateFormProps = {
  initialData: {
    name: string;
    initialPrompt?: string;
    systemPrompt?: string;
    attachedFunctions: string[];
    resultSchema?: unknown;
    inputSchema?: unknown;
  };
  onSubmit: (data: z.infer<typeof formSchema>) => Promise<void>;
  isLoading: boolean;
};

export function PromptTemplateForm({
  initialData,
  onSubmit,
  isLoading,
}: PromptTemplateFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData.name,
      initialPrompt: initialData.initialPrompt,
      systemPrompt: initialData.systemPrompt,
      attachedFunctions: initialData.attachedFunctions?.join(", "),
      resultSchema: JSON.stringify(initialData.resultSchema, null, 2),
      inputSchema: JSON.stringify(initialData.inputSchema, null, 2),
    },
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      const adjustHeight = () => {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      };

      adjustHeight();
      textarea.addEventListener("input", adjustHeight);

      return () => {
        textarea.removeEventListener("input", adjustHeight);
      };
    }
  }, []);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                The name of the Run Configuration
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="initialPrompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prompt</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  ref={textareaRef}
                  className="resize-none overflow-scroll min-h-[100px]"
                />
              </FormControl>
              <FormDescription>
                Prompt which defines the first &quot;human&quot; message in the
                Run
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="systemPrompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>System Prompt</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  ref={textareaRef}
                  className="resize-none overflow-scroll min-h-[100px]"
                />
              </FormControl>
              <FormDescription>
                System prompt to attach to the Run
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="attachedFunctions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Attached Functions (comma-separated)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {form.watch("attachedFunctions")?.length > 0 ? (
                  <Alert variant="default">
                    <AlertTitle className="flex flex-row items-center gap-1">
                      <FileWarning className="w-4 h-4" />
                      You have explicitly attached functions.
                    </AlertTitle>
                    <AlertDescription className="text-sm text-xs mt-2">
                      By explicitly attaching functions, you limit the functions
                      that the run will be able to use. If you do not specify
                      any attached functions, all function will be available. If
                      you want more deterministic results, you should explicitly
                      attach the functions you want to use.
                    </AlertDescription>
                  </Alert>
                ) : (
                  "No function has been explicitly attached."
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <p className="font-semibold">Result Schema</p>
          <p className="text-xs text-gray-500 mb-2 mt-1">
            Sets the{" "}
            <Link
              href="https://docs.inferable.ai/pages/runs#resultschema"
              target="_blank"
              className="underline"
            >
              result schema
            </Link>{" "}
            for all Runs using this configuration
            <br />
            Please see our{" "}
            <Link
              href="https://docs.inferable.ai/pages/runs#config"
              target="_blank"
              className="underline"
            >
              docs
            </Link>{" "}
            for more information
          </p>
          <FormField
            control={form.control}
            name="resultSchema"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <StructuredOutputEditor
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div>
          <p className="font-semibold">Input Schema</p>
          <p className="text-xs text-gray-500 mb-2 mt-1">
            Enforce that all Runs using this configuration must provide an{" "}
            <Link
              href="https://docs.inferable.ai/pages/runs#config"
              target="_blank"
              className="underline"
            >
              {" "}
              input object
            </Link>{" "}
            the schema.
            <br />
            Please see our{" "}
            <Link
              href="https://docs.inferable.ai/pages/run-configs#structured-input"
              target="_blank"
              className="underline"
            >
              docs
            </Link>{" "}
            for more information
          </p>
          <FormField
            control={form.control}
            name="inputSchema"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <StructuredOutputEditor
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Run Configuration"}
        </Button>
      </form>
    </Form>
  );
}
