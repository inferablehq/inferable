import { z } from "zod";
import { Textarea } from "../ui/textarea";
import { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import debounce from "lodash/debounce";
import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";

const basicStructuredOutputSchema = z.object({
  type: z.literal("object"),
  properties: z.record(
    z.object({
      type: z.literal("string"),
      description: z.string().optional(),
    })
  ),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().default(false),
});

interface Property {
  key: string;
  type: string;
  description: string;
  required: boolean;
}

const emptyBasicSchema = {
  type: "object",
  properties: {},
  required: [],
};

export function StructuredOutputEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [editorType, setEditorType] = useState<"basic" | "advanced">("basic");
  const [advancedValue, setAdvancedValue] = useState(value);

  const initializeEditor = useCallback(
    ({
      schemaValue,
      editorType,
    }:
      | {
          schemaValue: z.infer<typeof basicStructuredOutputSchema>;
          editorType: "basic";
        }
      | {
          schemaValue: object;
          editorType: "advanced";
        }) => {
      setEditorType(editorType);

      try {
        if (Object.keys(schemaValue).length === 0) {
          setProperties([]);
          onChange(JSON.stringify(emptyBasicSchema, null, 2));
          return;
        }
      } catch (error) {
        console.error(error);
      }

      if (editorType === "basic") {
        const props: Property[] = Object.entries(schemaValue.properties).map(([key, prop]) => ({
          key,
          type: prop.type,
          description: prop.description || "",
          required: schemaValue.required?.includes(key) || false,
        }));
        setProperties(props);
      } else {
        setAdvancedValue(JSON.stringify(schemaValue, null, 2));
      }
    },
    [onChange]
  );

  useEffect(() => {
    try {
      const parsedValue = JSON.parse(value);

      if (basicStructuredOutputSchema.safeParse(parsedValue).success) {
        initializeEditor({ schemaValue: parsedValue, editorType: "basic" });
      } else {
        console.log(basicStructuredOutputSchema.safeParse(value).error);
        initializeEditor({ schemaValue: parsedValue, editorType: "advanced" });
      }
    } catch (error) {
      // Do nothing
    }
  }, [value, initializeEditor]);

  const debouncedUpdateSchema = useCallback(
    debounce((newProperties: Property[]) => {
      if (newProperties.length === 0) {
        onChange("");
        return;
      }
      const schema = {
        type: "object",
        properties: Object.fromEntries(
          newProperties.map(({ key, description }) => [
            key,
            {
              type: "string",
              description,
            },
          ])
        ),
        required: newProperties.filter(p => p.required).map(p => p.key),
        additionalProperties: false,
      };
      onChange(JSON.stringify(schema, null, 2));
    }, 300),
    [onChange]
  );

  const updateProperty = useCallback(
    (index: number, field: keyof Property, value: string | boolean) => {
      setProperties(prevProperties => {
        const updatedProperties = [...prevProperties];
        updatedProperties[index] = {
          ...updatedProperties[index],
          [field]: value,
        };
        debouncedUpdateSchema(updatedProperties);
        return updatedProperties;
      });
    },
    [debouncedUpdateSchema]
  );

  const addProperty = () => {
    setProperties([
      ...properties,
      {
        key: "",
        type: "string",
        description: "",
        required: false,
      },
    ]);
  };

  const handleEditorTypeChange = (newType: "basic" | "advanced") => {
    setEditorType(newType);
    if (newType === "basic") {
      initializeEditor({
        schemaValue: JSON.parse(value || JSON.stringify(emptyBasicSchema)),
        editorType: "basic",
      });
    } else {
      setAdvancedValue(value);
    }
  };

  const handleAdvancedChange = (newValue: string) => {
    setAdvancedValue(newValue);
    onChange(newValue);
  };

  const removeProperty = (index: number) => {
    setProperties(prevProperties => {
      const updatedProperties = prevProperties.filter((_, i) => i !== index);
      debouncedUpdateSchema(updatedProperties);
      return updatedProperties;
    });
  };

  return (
    <div className="space-y-4 min-h-[400px] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <Select value={editorType} onValueChange={handleEditorTypeChange}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Editor type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
        {editorType === "basic" && (
          <Button
            onClick={e => {
              e.stopPropagation();
              e.preventDefault();
              addProperty();
            }}
            className="h-8 text-xs"
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Property
          </Button>
        )}
      </div>

      {editorType === "advanced" ? (
        <Textarea
          value={advancedValue}
          onChange={e => handleAdvancedChange(e.target.value)}
          className="flex-grow min-h-[340px] font-mono text-sm"
        />
      ) : (
        <div className="flex-grow flex flex-col min-h-[340px] overflow-y-auto space-y-4">
          {properties.map((prop, index) => (
            <div key={index} className="bg-secondary/50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium">Property</label>
                <Button
                  onClick={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    removeProperty(index);
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-destructive/20"
                >
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="flex space-x-2 mb-2">
                <Input
                  value={prop.key}
                  onChange={e => updateProperty(index, "key", e.target.value)}
                  className={cn(
                    "flex-grow",
                    prop.key.trim() === "" && "border-destructive focus-visible:ring-destructive"
                  )}
                  placeholder="Enter property name"
                />
                <div className="flex items-center space-x-2 bg-background px-3 rounded-md">
                  <Checkbox
                    id={`required-${index}`}
                    checked={prop.required}
                    onCheckedChange={checked => updateProperty(index, "required", !!checked)}
                  />
                  <label htmlFor={`required-${index}`} className="text-xs cursor-pointer">
                    Required
                  </label>
                </div>
              </div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={prop.description}
                onChange={e => updateProperty(index, "description", e.target.value)}
                className={cn(
                  "mt-1",
                  prop.description.trim() === "" &&
                    "border-orange-500 focus-visible:ring-orange-500"
                )}
                placeholder="Enter property description"
                rows={3}
              />
            </div>
          ))}
          {properties.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No properties added. Click &quot;Add Property&quot; to start.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
