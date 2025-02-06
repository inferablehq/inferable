import { colorizeJSON } from "@/lib/colorize-json";
import { cn } from "@/lib/utils";

export const ReadOnlyJSON = ({ json, dark }: { json: string | object; dark?: boolean }) => {
  let formattedJson: string;

  if (typeof json === "object") {
    formattedJson = JSON.stringify(json, null, 2);
  } else if (typeof json === "string") {
    try {
      // Check if the string is already valid JSON
      JSON.parse(json);
      formattedJson = JSON.stringify(JSON.parse(json), null, 2);
    } catch (e) {
      // If it's not valid JSON, use as is
      formattedJson = json;
    }
  } else {
    formattedJson = String(json);
  }

  // Replace \n with actual line breaks
  formattedJson = formattedJson.replace(/\\n/g, "\n");

  const colorizedJson = colorizeJSON(formattedJson, dark);

  return (
    <pre
      className={cn(
        "p-2 rounded-md overflow-x-auto text-xs whitespace-pre-wrap",
      )}
      dangerouslySetInnerHTML={{
        __html: colorizedJson,
      }}
    />
  );
};
