import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AlertCircle, SquareFunction } from "lucide-react";
import { useState } from "react";
import { ReadOnlyJSON } from "../read-only-json";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { ClusterState, useClusterState } from "../use-cluster-state";

interface ToolContextButtonProps {
  clusterId: string;
  tool: ClusterState["tools"][number];
}

const ToolContextButton: React.FC<ToolContextButtonProps> = ({ clusterId, tool }) => {
  const [isOpen, setIsOpen] = useState(false);

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
            {tool.name}
          </SheetTitle>
          <SheetDescription>Details for {tool.name}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {tool ? (
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="functionName">Name</Label>
                  <pre className="p-2">{tool.name}</pre>
                </div>
                {tool.description && (
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <pre className="p-2">{tool.description}</pre>
                  </div>
                )}
                {tool.schema ? (
                  <div className="space-y-2">
                    <Label htmlFor="schema">Schema</Label>
                    <ReadOnlyJSON json={tool.schema} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="schema">Schema</Label>
                    <pre className="p-2">No schema available</pre>
                  </div>
                )}
                {tool.config ? (
                  <div className="space-y-2">
                    <Label htmlFor="config">Config</Label>
                    <ReadOnlyJSON json={tool.config} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="config">Config</Label>
                    <pre className="p-2">No config available</pre>
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
