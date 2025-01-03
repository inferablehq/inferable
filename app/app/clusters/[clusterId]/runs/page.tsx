import { PromptTextarea } from "@/components/chat/prompt-textarea";
import { Card, CardContent } from "@/components/ui/card";

export default async function Page({ params: { clusterId } }: { params: { clusterId: string } }) {
  return (
    <div className="flex flex-col overflow-auto space-y-4">
      <Card className="w-full onboarding-prompt bg-white border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-md mb-6">
        <CardContent className="pt-6">
          <PromptTextarea clusterId={clusterId} />
        </CardContent>
      </Card>
    </div>
  );
}
