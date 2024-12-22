import { client } from "@/client/client";
import { MachineList } from "@/components/MachineList";
import { ServiceList } from "@/components/ServiceList";
import { RunList } from "@/components/WorkflowList";
import { auth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Blocks, Cpu } from "lucide-react";

export async function generateMetadata({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = auth();
  const token = await getToken();

  const cluster = await client.getCluster({
    headers: { authorization: `Bearer ${token}` },
    params: { clusterId },
  });

  if (cluster.status !== 200) {
    return { title: "Inferable" };
  }

  return { title: `${cluster.body?.name}` };
}

async function Home({
  params: { clusterId },
  children,
}: {
  params: {
    clusterId: string;
  };
  children: React.ReactNode;
}) {
  const { getToken } = auth();
  const token = await getToken();
  const cluster = await client.getCluster({
    headers: { authorization: `Bearer ${token}` },
    params: { clusterId },
  });

  return (
    <main className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between px-6 py-2">
        <div className="md:hidden">
          <RunList clusterId={clusterId} />
        </div>
        <span className="text-sm text-muted-foreground font-medium">
          {cluster.status === 200 ? cluster.body.name : clusterId}
        </span>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Cpu className="h-4 w-4 mr-1.5" />
                Machines
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85%] sm:w-[600px] pt-10">
              <MachineList clusterId={clusterId} />
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Blocks className="h-4 w-4 mr-1.5" />
                Services
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85%] sm:w-[800px] pt-10">
              <ServiceList clusterId={clusterId} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="flex-1 flex min-h-0 pl-2">
        <div className="hidden md:block">
          <RunList clusterId={clusterId} />
        </div>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </main>
  );
}

export default Home;
