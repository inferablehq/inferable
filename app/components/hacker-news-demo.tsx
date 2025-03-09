"use client";

import { client } from "@/client/client";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { format } from "date-fns";
import { useState } from "react";
import toast from "react-hot-toast";

export function HackerNewsDemo({ clusterId }: { clusterId: string }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const { getToken } = useAuth();
  const { user } = useUser();

  /**
   * Creates an API key for the Hacker News demo
   * @returns The created API key or null if creation failed
   */
  const createApiKey = async () => {
    const loading = toast.loading("Creating API key for HN Demo...");

    try {
      // Generate a key name with current timestamp
      const keyName = `HN Demo Key - ${format(new Date(), "yyyy-MM-dd HH:mm")}`;

      // Call API to create the key
      const result = await client.createApiKey({
        headers: { authorization: `Bearer ${await getToken()}` },
        params: { clusterId },
        body: { name: keyName },
      });

      toast.dismiss(loading);

      if (result.status === 200) {
        toast.success("API key created successfully");
        setApiKey(result.body.key);
        return result.body.key;
      } else {
        createErrorToast(result, "Failed to create API key");
        return null;
      }
    } catch (err) {
      toast.dismiss(loading);
      createErrorToast(err, "Failed to create API key");
      return null;
    }
  };

  /**
   * Opens the modal and creates an API key
   */
  const handleOpenModal = async () => {
    await createApiKey();
    setOpen(true);
  };

  /**
   * Closes the modal and resets the API key
   */
  const handleClose = () => {
    setOpen(false);
    setApiKey(null);
  };

  /**
   * Generates the script content for the Hacker News demo
   * @returns Formatted script with installation and run commands
   */
  const getScriptContent = () => {
    const userEmail =
      user?.primaryEmailAddress?.emailAddress || "your_email@example.com";

    // Check if running on localhost
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    const localhostEnvVar = isLocalhost
      ? "export INFERABLE_API_ENDPOINT=http://localhost:4000\n"
      : "";

    return `# Clone the starter repository
git clone git@github.com:inferablehq/inferable-node-starter.git inferable-hn-demo-${clusterId.slice(20)}

# Navigate to the project directory
cd inferable-hn-demo-${clusterId.slice(20)}

# Install dependencies
npm install

# Set environment variables
export INFERABLE_API_SECRET=${apiKey || "your_api_secret"}
export INFERABLE_NOTIFICATION_EMAIL=${userEmail}
${localhostEnvVar}
# Run the Hacker News demo
npm run hn`;
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpenModal}
        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      >
        Run Hacker News Demo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run Hacker News Demo Workflow</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copy and paste the following commands in your terminal to run the
              Hacker News demo workflow:
            </p>

            <div className="relative">
              <pre className="p-4 bg-muted rounded-md font-mono text-sm overflow-x-auto whitespace-pre-wrap">
                {getScriptContent()}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={getScriptContent()} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClose}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
