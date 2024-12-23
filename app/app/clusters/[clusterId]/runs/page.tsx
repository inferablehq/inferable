import { client } from "@/client/client";
import { PromptTextarea } from "@/components/chat/prompt-textarea";
import ErrorDisplay from "@/components/error-display";
import { ServicesQuickstart } from "@/components/services-quickstart";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@clerk/nextjs";

export default async function Page({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = auth();
  const token = await getToken();

  const response = await client.getCluster({
    headers: {
      authorization: `Bearer ${token}`,
    },
    params: {
      clusterId: clusterId,
    },
  });

  // TODO: limit this to one event.
  const events = await client.listEvents({
    headers: {
      authorization: `Bearer ${token}`,
    },
    params: { clusterId },
  });

  if (response.status !== 200 || events.status !== 200) {
    return <ErrorDisplay error={response.body} status={response.status} />;
  }

  if (events.body?.length === 0) {
    return <ServicesQuickstart clusterId={clusterId} />;
  }

  return (
    <div className="flex flex-col overflow-auto px-2 space-y-4">
      <Card className="w-full onboarding-prompt bg-white border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-md mb-6">
        <CardContent className="pt-6">
          <PromptTextarea clusterId={clusterId} />
        </CardContent>
      </Card>
    </div>
  );
}
