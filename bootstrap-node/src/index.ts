import { Inferable } from "inferable";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFilePromise = promisify(execFile);

const client = new Inferable({
  // Get your key from https://app.inferable.ai/clusters
  apiSecret: process.env.INFERABLE_API_SECRET,
});

client.default.register({
  name: "exec",
  func: async ({ command, arg }: { command: string; arg?: string }) => {
    const args = arg ? [arg] : [];
    const { stdout, stderr } = await execFilePromise(command, args);
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  },
  description: "Executes a system command",
  schema: {
    input: z.object({
      command: z
        .enum(["pwd", "ls", "cat", "echo"]) // This prevents arbitrary commands
        .describe("The command to execute"),
      arg: z
        .string()
        .describe("The argument to pass to the command")
        .optional(),
    }),
  },
});

client.default.start().then(() => {
  console.log("Inferable demo service started");
});
