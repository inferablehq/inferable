import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { client } from "@/client/client";
import { auth } from "@clerk/nextjs";
import { revalidatePath } from "next/cache";
import ErrorDisplay from "@/components/error-display";

export default async function TavilyIntegrationPage({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = auth();

  const response = await client.getIntegrations({
    headers: {
      authorization: `Bearer ${await getToken()}`,
    },
    params: {
      clusterId,
    },
  });

  if (response.status !== 200) {
    return <ErrorDisplay status={response.status} error={response.body} />;
  }

  async function handleSubmit(formData: FormData) {
    "use server";

    const apiKey = formData.get("apiKey") as string;

    const { getToken } = auth();

    await client.upsertIntegrations({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: { clusterId },
      body: {
        tavily: {
          apiKey,
        },
      },
    });

    revalidatePath(`/clusters/${clusterId}/integrations/tavily`);
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Tavily Integration</h1>
        <p className="text-gray-500 mb-6">
          Configure your Tavily integration to enable web search capabilities
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="apiKey" className="text-sm font-medium">
                  API Key
                </label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  defaultValue={response.body.tavily?.apiKey ?? ""}
                  placeholder="Enter your Tavily API key"
                />
              </div>
              <Button type="submit">Save Configuration</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
