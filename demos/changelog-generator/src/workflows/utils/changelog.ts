import { z } from "zod";

export const ChangeType = z.enum(["bugfix", "feature", "other", "sdk-release"]);
export type ChangeType = z.infer<typeof ChangeType>;

export interface Change {
  type: ChangeType;
  description: string;
  date: string;
}

interface FormatChangelogContentParams {
  overallSummary: string;
  changes: Change[];
}

/**
 * Formats the changelog content with a consistent structure
 * @param params Parameters containing the summary and changes
 * @returns Formatted changelog content as a string
 */
export function formatChangelogContent({
  overallSummary,
  changes,
}: FormatChangelogContentParams): string {
  // Get the latest date from changes
  const latestDate = changes
    .map((change) => new Date(change.date))
    .reduce((latest, current) => (current > latest ? current : latest))
    .toISOString()
    .split("T")[0];

  // Format the changelog content
  const content = `# Release ${latestDate}

${overallSummary}

## Changes

${Object.entries(
  changes.reduce(
    (acc, change) => {
      const type =
        change.type === "sdk-release"
          ? "SDK Release"
          : change.type === "bugfix"
            ? "Bug Fix"
            : change.type === "feature"
              ? "Feature"
              : "Other";

      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(change.description);
      return acc;
    },
    {} as Record<string, string[]>,
  ),
)
  .map(
    ([type, descriptions]) =>
      `### ${type}\n${descriptions.map((desc) => `- ${desc}`).join("\n")}`,
  )
  .join("\n\n")}`;

  return content;
}
