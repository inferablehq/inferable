/// <reference types="node" />

import { z } from "zod";
import { inferable } from "../inferable";
import { helpers } from "inferable/bin/workflows/workflow";
import process from "process";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { sendToZapier } from "./utils/zapier";
import { formatChangelogContent } from "./utils/changelog";
import assert from "assert";

export const workflow = inferable.workflows.create({
  name: "summarize",
  description: "Summarizes the latest commits.",
  inputSchema: z.object({
    executionId: z.string(),
  }),
});

workflow.version(1).define(async (ctx) => {
  const commitHashes = await ctx.result("getCommits", async () => {
    const lastCommitHash = (
      await fs.readFile(path.join(__dirname, "last-commit-hash.txt"), "utf-8")
    ).trim();

    const commits = await execSync(`git log ${lastCommitHash}..HEAD --oneline`);

    return commits
      .toString()
      .split("\n")
      .slice(0, 10) // Limit to 10 commits maximum
      .map((commit) => commit.split(" ")[0]);
  });

  const commits = await Promise.all(
    commitHashes.map((hash) => {
      const agent = ctx.agent({
        name: "summarizeCommit",
        systemPrompt: helpers.structuredPrompt({
          facts: [
            "You are given a commit hash",
            "You can get details from the commit title and the description",
            "There's a tool to get commit details which will return concise information",
            "There's a tool to get the full diff of the commit which will return a large response, which must be used sparingly",
          ],
          goals: [
            "Understand the context of the commit from the title and description",
            "When there isn't enough information, use the diff to get more details",
          ],
        }),
        resultSchema: z.object({
          type: z.enum(["fix", "feature", "other"]),
          description: z.string(),
          date: z.string().describe("The date of the commit in ISO format"),
        }),
        tools: ["getCommitInfo", "getCommitDiff"], // these tools are defined in src/tools
      });

      return agent.trigger({
        data: {
          commitHash: hash,
        },
      });
    }),
  );

  const summaryAgent = ctx.agent({
    name: "summarizeCommits",
    systemPrompt: helpers.structuredPrompt({
      facts: [
        "You are a changelog generator",
        "You are given a list of changes, and you need to generated a changelog entry",
        "You only care about the significant changes, and not the minor ones like library updates and refactorings.",
        "There are multiple SDKs in the project. Any changes to the SDKs should be mentioned along with the SDK name.",
      ],
      goals: [
        "Output an overall summary of the commits, as if you were writing a changelog on behalf of the team, be concise and to the point",
        "Output a list of the most significant changes, and leave out the minor ones",
        "Pick the greatest version bump for each SDK release",
      ],
    }),
    resultSchema: z.object({
      overallSummary: z.string(),
      changes: z.array(
        z.object({
          type: z.enum(["bugfix", "feature", "other", "sdk-release"]),
          description: z.string(),
          date: z.string().describe("The date of the commit in ISO format"),
        }),
      ),
    }),
  });

  const summaryResult = await summaryAgent.trigger({
    data: { commits },
  });

  const changelogContent = await ctx.result("generateResult", async () => {
    const content = formatChangelogContent({
      overallSummary: summaryResult.result.overallSummary,
      changes: summaryResult.result.changes,
    });

    // Write to changelog.md in root directory
    const changelogPath = path.join(process.cwd(), "..", "..", "CHANGELOG.md");

    // Read existing content if file exists, otherwise use empty string
    const existingContent = await fs
      .readFile(changelogPath, "utf-8")
      .catch(() => "");

    // Combine new content with existing content
    const fullContent = `${content}\n\n${existingContent}`.trim();

    // Write the combined content back to the file
    await fs.writeFile(changelogPath, fullContent, "utf-8");

    // Update the last commit hash
    const lastCommitHash = commitHashes[0];
    await fs.writeFile(
      path.join(__dirname, "last-commit-hash.txt"),
      lastCommitHash.trim(),
      "utf-8",
    );

    return content;
  });

  const zapierResponse = await ctx.result("sendToZapier", async () => {
    const latestDate = summaryResult.result.changes
      .map((change) => new Date(change.date))
      .reduce((latest, current) => (current > latest ? current : latest))
      .toISOString()
      .split("T")[0];

    assert(process.env.ZAPIER_WEBHOOK_URL, "ZAPIER_WEBHOOK_URL is not set");

    return sendToZapier({
      data: {
        summary: summaryResult.result.overallSummary,
        changes: summaryResult.result.changes
          .sort((a, b) => a.type.localeCompare(b.type))
          .map((change) => `- ${change.type}: ${change.description}`)
          .join("\n"),
        title: `Release ${latestDate}`,
      },
      webhookUrl: process.env.ZAPIER_WEBHOOK_URL,
    });
  });

  return {
    changelogContent,
    zapierResponse,
  };
});

process.on("SIGTERM", () => {
  inferable.tools.unlisten();
});
