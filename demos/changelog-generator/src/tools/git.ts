import { execSync } from "child_process";
import { inferable } from "../inferable";
import { z } from "zod";
import process from "process";

export function getCommitInfo(input: { hash: string }) {
  // Get commit message (title and description)
  const commitCommand = `git --no-pager show -s ${input.hash}`;
  const commitOutput = execSync(commitCommand).toString();

  // Get changed files
  const filesCommand = `git --no-pager show --name-only ${input.hash}`;
  const changedFiles = execSync(filesCommand).toString();

  return {
    commitOutput,
    changedFiles,
  };
}

export function getCommitDiff(input: { hash: string }): string {
  // Get the full diff for the commit
  const diffCommand = `git --no-pager show ${input.hash}`;
  return execSync(diffCommand).toString();
}

inferable.tools.register({
  name: "getCommitInfo",
  func: getCommitInfo,
  description:
    "Gets detailed information about a specific commit including title, description, and changed files.",
  schema: {
    input: z.object({
      hash: z.string().describe("The commit hash to get information for."),
    }),
  },
});

inferable.tools.register({
  name: "getCommitDiff",
  func: getCommitDiff,
  description:
    "Gets the full diff for a specific commit. Warning: this is a large response.",
  schema: {
    input: z.object({
      hash: z.string().describe("The commit hash to get the diff for."),
    }),
  },
});

export const tools = inferable.tools;

process.on("SIGTERM", () => {
  inferable.tools.unlisten();
});
