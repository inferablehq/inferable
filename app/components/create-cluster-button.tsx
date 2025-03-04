"use client";

import { client } from "@/client/client";
import { Button, ButtonProps } from "@/components/ui/button";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { PlusIcon } from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

export const CreateClusterButton = ({
  label,
  variant,
}: {
  label: string;
  variant: ButtonProps["variant"];
}) => {
  const { getToken } = useAuth();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      onClick={async () => {
        const toastId = toast.loading("Creating cluster...");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await client
          .createCluster({
            headers: {
              authorization: `Bearer ${await getToken()}`,
            },
            body: {
              description: "Cluster created from playground",
            },
          })
          .then((result) => {
            toast.dismiss(toastId);
            if (result.status === 204) {
              toast.success("Successfully created a cluster.");
              router.refresh();
            } else {
              toast.error("Failed to create a cluster.");
            }
          })
          .catch((error) => {
            toast.dismiss(toastId);
            createErrorToast(error, "Failed to create a cluster.");
          });
      }}
    >
      <PlusIcon className="w-4 h-4 mr-2" />
      {label}
    </Button>
  );
};
