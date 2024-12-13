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
import { SquareFunction } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ReadOnlyJSON } from "../read-only-json";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

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
  const [context, setContext] = useState("");
  const { getToken } = useAuth();
  const [services, setServices] = useState<
    Array<{
      name: string;
      functions?: Array<{
        name: string;
        description?: string;
        schema?: string;
      }>;
    }>
  >([]);
  const [functionDetails, setFunctionDetails] = useState<{
    name: string;
    description?: string;
    schema?: string;
  } | null>(null);

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

  useEffect(() => {
    const findFunctionDetails = () => {
      const serviceObj = services.find((s) => s.name === service);
      if (serviceObj && serviceObj.functions) {
        const func = serviceObj.functions.find((f) => f.name === functionName);
        if (func) {
          setFunctionDetails(func);
        }
      }
    };

    if (services.length > 0) {
      findFunctionDetails();
    }
  }, [services, service, functionName]);

  const fetchContext = async () => {
    const token = await getToken();
    try {
      const result = await client.getFunctionMetadata({
        params: { clusterId, service, function: functionName },
        headers: { authorization: `Bearer ${token}` },
      });

      if (result.status === 200) {
        setContext(result.body?.additionalContext || "");
      } else {
        throw new Error("Failed to fetch tool context");
      }
    } catch (error) {
      console.error("Error fetching tool context:", error);
      toast.error("Failed to fetch tool context. Please try again.");
    }
  };

  const updateContext = async () => {
    const token = await getToken();
    try {
      const result = await client.upsertFunctionMetadata({
        params: { clusterId, service, function: functionName },
        headers: { authorization: `Bearer ${token}` },
        body: {
          additionalContext: context,
        },
      });

      if (result.status === 204) {
        toast.success("Tool context updated successfully.");
        setIsOpen(false);
      } else {
        throw new Error("Failed to update tool context");
      }
    } catch (error) {
      console.error("Error updating tool context:", error);
      toast.error("Failed to update tool context. Please try again.");
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="px-2 py-1"
          onClick={() => {
            fetchContext();
            setIsOpen(true);
          }}
        >
          <SquareFunction className="w-4 h-4" />
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
          {functionDetails && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="functionName">Function Name</Label>
                  <Input
                    id="functionName"
                    value={functionDetails.name}
                    readOnly
                  />
                </div>
                {functionDetails.description && (
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={functionDetails.description}
                      readOnly
                      rows={3}
                    />
                  </div>
                )}
                {functionDetails.schema && (
                  <div className="space-y-2">
                    <Label htmlFor="schema">Schema</Label>
                    <ReadOnlyJSON json={functionDetails.schema} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ToolContextButton;
