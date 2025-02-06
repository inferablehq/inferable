export const colorizeJSON = (json: string, dark?: boolean) => {
  const colorMap: { [key: string]: string } = dark ? {
    string: "#bfdbfe", // blue-200
    number: "#93c5fd", // blue-300
    boolean: "#60a5fa", // blue-400
    null: "#3b82f6",   // blue-500
    key: "#ffffff",    // white
  } : {
    string: "#1e40af", // blue-800
    number: "#1d4ed8", // blue-700
    boolean: "#2563eb", // blue-600
    null: "#3b82f6",    // blue-500
    key: "#1e3a8a",     // blue-900
  };

  // First color the JSON elements
  const coloredJson = json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let type = "number";
      if (/^"/.test(match)) {
        type = /:$/.test(match) ? "key" : "string";
      } else if (/true|false/.test(match)) {
        type = "boolean";
      } else if (/null/.test(match)) {
        type = "null";
      }
      return `<span style="color:${colorMap[type]}">${match}</span>`;
    }
  );

  // Wrap the entire result in a span to color structural elements
  return `<span style="color:${dark ? "#999" : "#737373"}">${coloredJson}</span>`; // gray-600/500 for braces and commas
};
