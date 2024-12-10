import { Inferable } from "inferable";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import assert from "assert";

const execFilePromise = promisify(execFile);

const client = new Inferable({
  // Get your key from https://app.inferable.ai/clusters
  apiSecret: process.env.INFERABLE_API_SECRET,
});

client.default.register({
  name: "exec",
  func: async ({ command, arg }: { command: string; arg: string }) => {
    assert(arg.startsWith("./"), "can only access paths starting with ./");
    const { stdout, stderr } = await execFilePromise(command, [arg]);

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  },
  description: "Executes a system command",
  schema: {
    input: z.object({
      command: z
        .enum(["ls", "cat"]) // This prevents arbitrary commands
        .describe("The command to execute"),
      arg: z.string().describe("The argument to pass to the command"),
    }),
  },
});

client.default.start().then(() => {
  console.log("Inferable demo service started");
});
