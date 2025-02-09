"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Blocks, Cpu, Plus, PlusCircleIcon } from "lucide-react";
import { DeadGrayCircle, DeadRedCircle, LiveGreenCircle } from "./circles";
import { Button } from "./ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, pluralize } from "@/lib/utils";
import { formatDistance, formatRelative } from "date-fns";
import ToolContextButton from "./chat/ToolContextButton";
import { EventsOverlayButton } from "./events-overlay";
import { QuickStartDemo } from "./quick-start-demo";
import { ClusterState, useClusterState } from "./useClusterState";




function FlatToolsList({ tools, clusterId }: { tools: ClusterState["tools"]; clusterId: string }) {
  const allTools = tools.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-1/3">Name</TableHead>
            <TableHead className="w-1/3">Group</TableHead>
            <TableHead className="w-1/3">Last Update</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allTools.map(tool => {
            const isActive =
              new Date(tool.createdAt) > new Date() ||
              Date.now() - new Date(tool.createdAt).getTime() < 1000 * 60;

            return (
              <TableRow key={`${tool.name}`} className="hover:bg-secondary/40">
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {tool.name}
                      </span>
                      <ToolContextButton
                        clusterId={clusterId}
                        tool={tool}
                      />
                    </div>
                    <div
                      className="truncate text-xs text-muted-foreground max-w-[40vw] font-mono"
                      title={tool.description || "No description"}
                    >
                      {tool.description || "No description"}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Blocks className="w-3 h-3 text-primary" />
                    </div>
                    <span className="font-medium">{tool.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {!tool.shouldExpire ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span>Permanent Sync</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", isActive ? "bg-green-500" : "bg-gray-300")} />
                      <span className="font-mono text-sm">
                        {formatDistance(new Date(tool.createdAt), new Date(), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ServicesOverview({ clusterId, tools }: { clusterId: string, tools: ClusterState["tools"] }) {
  const sortedServices = tools.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {sortedServices.length === 0 ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="w-full h-[120px] flex flex-col items-center justify-center gap-2 border border-dashed border-gray-200 rounded-xl transition-all duration-200 hover:border-gray-300 hover:bg-gray-50/50"
            >
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <PlusCircleIcon className="w-5 h-5 text-gray-600" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-gray-900">No Tools Connected</h3>
                <p className="text-sm text-gray-500">Click here to add your first tool</p>
              </div>
            </Button>
          </SheetTrigger>
          <SheetContent style={{ minWidth: 800 }} className="overflow-y-auto h-screen">
            <SheetHeader className="pb-6">
              <SheetTitle>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-xl">Create New Tool</div>
                    <div className="text-sm text-muted-foreground">
                      Get started with a new tool in your cluster
                    </div>
                  </div>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-6">
              <CreateNewServiceOptions clusterId={clusterId} />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <FlatToolsList tools={tools} clusterId={clusterId} />
      )}
    </div>
  );
}

export function ClusterDetails({ clusterId }: { clusterId: string }): JSX.Element {
  const {
    machines,
    tools,
    isLoading: isInitialLoading,
    liveMachineCount,
  } = useClusterState(clusterId);

  const workflowTools = tools.filter(tool => tool.name.startsWith('workflows_'));

  const nonWorkflowTools = tools.filter(tool => !tool.name.startsWith('workflows_'));

  return (
    <div className="flex flex-col space-y-3 w-full">


      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="group relative flex items-center w-full px-5 py-6 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-lg"
          >
            <div className="absolute -top-1.5 -right-1.5">
              {isInitialLoading ? (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-700">Loading</span>
                </div>
              ) : liveMachineCount > 0 ? (
                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <div className="h-5 w-5 shrink-0 rounded-xl flex items-center justify-center">
                <Cpu className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-semibold text-gray-900">Machines</span>
                <span className="text-xs text-gray-500 font-mono">{liveMachineCount} Active</span>
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto h-screen min-w-[800px]">
          <SheetHeader className="pb-6">
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Machines</div>
                  <div className="text-sm text-muted-foreground">
                    Machines are instances with the Inferable SDK installed and polling.
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <MachinesOverview clusterId={clusterId} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="group relative flex items-center w-full px-5 py-6 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-lg"
          >
            <div className="absolute -top-1.5 -right-1.5">
              {isInitialLoading ? (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-700">Loading</span>
                </div>
              ) : nonWorkflowTools.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <div className="h-5 w-5 shrink-0 rounded-xl flex items-center justify-center">
                <Blocks className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-semibold text-gray-900">Tools</span>
                <span className="text-xs text-gray-500 font-mono">
                  {tools.length}{" "}
                  {pluralize("Tool", tools.length)}
                </span>
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent style={{ minWidth: "80%" }} className="overflow-y-auto h-screen">
          <SheetHeader className="pb-6">
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Blocks className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Tools</div>
                  <div className="text-sm text-muted-foreground">
                    Manage and monitor your cluster tools
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ServicesOverview clusterId={clusterId} tools={tools} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="group relative flex items-center w-full px-5 py-6 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-lg"
          >
            <div className="absolute -top-1.5 -right-1.5">
              {isInitialLoading ? (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-700">Loading</span>
                </div>
              ) : workflowTools.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <div className="h-5 w-5 shrink-0 rounded-xl flex items-center justify-center">
                <Blocks className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-semibold text-gray-900">Workflows</span>
                <span className="text-xs text-gray-500 font-mono">
                  {workflowTools.length}{" "}
                  {pluralize("Workflow", workflowTools.length)}
                </span>
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent style={{ minWidth: "80%" }} className="overflow-y-auto h-screen">
          <SheetHeader className="pb-6">
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Blocks className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Workflows</div>
                  <div className="text-sm text-muted-foreground">
                    Manage and monitor your cluster workflows
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ServicesOverview clusterId={clusterId} tools={workflowTools} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            data-add-services-trigger
            className={cn(
              "group relative flex items-center w-full px-5 py-6 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-lg",
              !tools.length && !machines.length && "border-primary"
            )}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="h-5 w-5 shrink-0 rounded-xl flex items-center justify-center">
                <PlusCircleIcon
                  className={cn(
                    "w-5 h-5 text-primary/80 transition-all duration-300 group-hover:text-primary"
                  )}
                />
              </div>
              <div className="flex flex-col items-start gap-0.5 py-2">
                <span className="font-semibold text-gray-900">Add Services</span>
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent style={{ minWidth: 800 }} className="overflow-y-auto h-screen">
          <SheetHeader className="pb-6">
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Create New Service</div>
                  <div className="text-sm text-muted-foreground">
                    Get started with a new service in your cluster
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            <CreateNewServiceOptions clusterId={clusterId} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function CreateNewServiceOptions({ clusterId }: { clusterId: string }) {
  return (
    <div className="space-y-4">
      <QuickStartDemo clusterId={clusterId} />

      <div className="rounded-xl p-5 shadow-sm border border-gray-200 bg-gray-50/50 transition-all duration-200">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Blocks className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <div className="text-base font-medium text-gray-900">Custom Local Service</div>
            <div className="text-sm text-gray-500">
              Create your own service with custom functions running locally
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <a
              href="https://github.com/inferablehq/inferable/tree/main/sdk-node"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                variant="outline"
                className="w-full h-auto py-4 bg-white hover:bg-gray-50 border-gray-200"
              >
                <div className="flex flex-col items-center gap-2">
                  <img
                    src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg"
                    alt="Node.js"
                    className="w-8 h-8"
                  />
                  <span className="text-sm">Node.js SDK</span>
                </div>
              </Button>
            </a>
            <a
              href="https://github.com/inferablehq/inferable/tree/main/sdk-go"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                variant="outline"
                className="w-full h-auto py-4 bg-white hover:bg-gray-50 border-gray-200"
              >
                <div className="flex flex-col items-center gap-2">
                  <img
                    src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original-wordmark.svg"
                    alt="Go"
                    className="w-8 h-8"
                  />
                  <span className="text-sm">Go SDK</span>
                </div>
              </Button>
            </a>
            <a
              href="https://github.com/inferablehq/inferable/tree/main/sdk-dotnet"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                variant="outline"
                className="w-full h-auto py-4 bg-white hover:bg-gray-50 border-gray-200"
              >
                <div className="flex flex-col items-center gap-2">
                  <img
                    src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg"
                    alt="C#"
                    className="w-8 h-8"
                  />
                  <span className="text-sm">C# SDK</span>
                </div>
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MachinesOverview({ clusterId }: { clusterId: string }) {
  const { machines } = useClusterState(clusterId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {machines && machines.length > 0 ? (
          machines
            .sort((a, b) => new Date(b.lastPingAt!).getTime() - new Date(a.lastPingAt!).getTime())
            .map(m => <MachineCard key={m.id} machine={m} clusterId={clusterId} />)
        ) : (
          <div className="col-span-full flex items-center justify-center p-8 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <DeadRedCircle />
              <span className="text-sm text-gray-600">Your machines are offline</span>
              <p className="text-xs text-muted-foreground max-w-[300px] text-center">
                No active machines found in this cluster. Make sure your machines are running and
                properly configured.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MachineCard({
  machine,
  clusterId,
}: {
  machine: ClusterState["machines"][number];
  clusterId: string;
}) {
  const isLive = machine.lastPingAt
    ? Date.now() - new Date(machine.lastPingAt).getTime() < 1000 * 60
    : false;

  return (
    <div
      className={cn(
        "rounded-xl p-5 shadow-sm border transition-all duration-200 hover:shadow-md",
        isLive ? "bg-green-50/30 border-green-100" : "bg-gray-50/30 border-gray-100"
      )}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div>{isLive ? <LiveGreenCircle /> : <DeadGrayCircle />}</div>
          <div>
            <div className="text-sm font-medium font-mono">{machine.id}</div>
            <div className="text-xs text-muted-foreground">{machine.ip}</div>
          </div>
        </div>
        <EventsOverlayButton clusterId={clusterId} query={{ machineId: machine.id }} />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <div
          className={cn(
            "px-2 py-1 rounded-full font-medium",
            isLive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
          )}
        >
          {isLive ? "Active" : "Inactive"}
        </div>
        <div className="text-muted-foreground">
          Last heartbeat: {formatRelative(machine.lastPingAt!, new Date())}
        </div>
      </div>
    </div>
  );
}
