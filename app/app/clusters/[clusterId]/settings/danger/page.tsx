"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { client } from "@/client/client";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useState, useCallback } from "react";
import toast from "react-hot-toast";

export default function DangerPage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = useAuth();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const handleDeleteCluster = useCallback(async () => {
    try {
      const result = await client.deleteCluster({
        headers: { authorization: `Bearer ${await getToken()}` },
        params: { clusterId },
      });

      if (result.status === 204) {
        toast.success("Cluster deleted successfully");
        // Redirect to clusters page
        window.location.href = "/clusters";
      } else {
        createErrorToast(result, "Failed to delete cluster");
      }
    } catch (err) {
      createErrorToast(err, "Failed to delete cluster");
    }
  }, [clusterId, getToken]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Actions here can lead to irreversible changes to your cluster
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive p-4">
            <div className="space-y-2">
              <div className="font-medium">Delete Cluster</div>
              <p className="text-sm text-muted-foreground">
                Permanently remove this cluster and all its associated data.
                This action cannot be undone.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive hover:bg-destructive/10"
                  >
                    Delete Cluster
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-4">
                      <p>
                        This action cannot be undone. This will permanently
                        delete your cluster and remove all associated data
                        including runs, knowledge bases, and configurations.
                      </p>
                      <div className="space-y-2">
                        <p>
                          Please type{" "}
                          <span className="font-medium">delete cluster</span> to
                          confirm.
                        </p>
                        <Input
                          value={deleteConfirmation}
                          onChange={e => setDeleteConfirmation(e.target.value)}
                          placeholder="delete cluster"
                          className="max-w-[200px]"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteCluster}
                      disabled={deleteConfirmation !== "delete cluster"}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    >
                      Delete Cluster
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
