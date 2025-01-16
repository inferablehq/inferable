"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ZapierIntegration({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
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
            <span className="text-2xl">⚡</span>
            <CardTitle>Configure Zapier</CardTitle>
          </div>
          <CardDescription>Connect Inferable to thousands of apps through Zapier.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button asChild variant="secondary">
              <a
                href="https://docs.inferable.ai/integrations/zapier"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read Documentation
              </a>
            </Button>
            <Button asChild>
              <a
                href="https://zapier.com/apps/inferable/integrations"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install from Zapier
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
