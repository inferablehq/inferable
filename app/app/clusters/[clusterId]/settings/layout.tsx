"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SettingsLayout({
  children,
  params: { clusterId },
}: {
  children: React.ReactNode;
  params: { clusterId: string };
}) {
  const pathname = usePathname() || "";
  const currentTab = pathname.includes("/details")
    ? "details"
    : pathname.includes("/api-keys")
      ? "api-keys"
      : pathname.includes("/danger")
        ? "danger"
        : "details";

  return (
    <div className="space-y-6 p-6">
    <div className="flex flex-col">
      <h1 className="text-2xl">Settings</h1>
      <p className="text-gray-500">
        Manage your cluster&apos;s settings.
      </p>
    </div>
      <Tabs value={currentTab} className="space-y-6">
        <TabsList>
          <Link href={`/clusters/${clusterId}/settings/details`}>
            <TabsTrigger value="details">Cluster Details</TabsTrigger>
          </Link>
          <Link href={`/clusters/${clusterId}/settings/api-keys`}>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          </Link>
          <Link href={`/clusters/${clusterId}/settings/danger`}>
            <TabsTrigger value="danger" className="text-destructive">
              Danger Zone
            </TabsTrigger>
          </Link>
        </TabsList>
        {children}
      </Tabs>
    </div>
  );
}
