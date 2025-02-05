import { client } from "@/client/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@clerk/nextjs";
import { SquareFunction, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ReadOnlyJSON } from "../read-only-json";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ClientInferResponseBody } from "@ts-rest/core";
import { contract } from "@/client/contract";

interface ToolContextButtonProps {
  clusterId: string;
  service: string;
  functionName: string;
}

const ToolContextButton: React.FC<ToolContextButtonProps> = ({
  clusterId,
  service,
  functionName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { getToken } = useAuth();
  const [services, setServices] = useState<
    ClientInferResponseBody<typeof contract.listServices, 200>
  >([]);

  useEffect(() => {
    const fetchServices = async () => {
      const token = await getToken();
      const headers = { authorization: `Bearer ${token}` };
      const params = { clusterId };

      try {
        const servicesResult = await client.listServices({
          headers,
          params,
        });
        if (servicesResult.status === 200) {
          setServices(servicesResult.body);
        }
      } catch (error) {
        console.error("Error fetching services:", error);
      }
    };

    fetchServices();
  }, [clusterId, getToken]);

  const functionDetails = services
    .find(s => s.name === service)
    ?.functions?.find(f => f.name === functionName);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="secondary" className="text-xs text-muted-foreground">
          Definition →
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[800px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center">
            <SquareFunction className="w-4 h-4 mr-2" />
            {service}.{functionName}
          </SheetTitle>
          <SheetDescription>
            Details for {service}.{functionName}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {functionDetails ? (
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="functionName">Name</Label>
                  <pre className="p-2">{functionDetails.name}</pre>
                </div>
                {functionDetails.description && (
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <pre className="p-2">{functionDetails.description}</pre>
                  </div>
                )}
                {functionDetails.schema && (
                  <div className="space-y-2">
                    <Label htmlFor="schema">Schema</Label>
                    <ReadOnlyJSON json={functionDetails.schema} />
                  </div>
                )}
                {functionDetails.config && (
                  <div className="space-y-2">
                    <Label htmlFor="config">Config</Label>
                    <ReadOnlyJSON json={functionDetails.config} />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Function Not Found</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                The specified function could not be found. It may have been removed or is not
                available in this service.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ToolContextButton;
