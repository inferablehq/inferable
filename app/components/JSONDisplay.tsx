import { colorizeJSON } from "@/lib/colorize-json";
import { Copy } from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";
import toast from "react-hot-toast";

export const JSONDisplay = ({ json }: { json: string | object }) => {
  const [isHovered, setIsHovered] = useState(false);

  let formattedJson: string;

  if (typeof json === "object") {
    formattedJson = JSON.stringify(json, null, 2);
  } else if (typeof json === "string") {
    try {
      formattedJson = JSON.stringify(JSON.parse(json), null, 2);
    } catch (e) {
      formattedJson = "{}";
    }
  } else {
    formattedJson = "{}";
  }

  // Replace \n with actual line breaks
  formattedJson = formattedJson.replace(/\\n/g, "\n");

  const colorizedJson = colorizeJSON(formattedJson);

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson);
    toast.success("Copied to clipboard");
  };

  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <pre
        className="font-mono text-xs leading-relaxed whitespace-pre-wrap"
        dangerouslySetInnerHTML={{
          __html: colorizedJson,
        }}
      />
      {isHovered && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute top-2 right-2 h-7 bg-background/80 backdrop-blur-sm"
          onClick={handleCopy}
        >
          <Copy className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Copy</span>
        </Button>
      )}
    </div>
  );
};
