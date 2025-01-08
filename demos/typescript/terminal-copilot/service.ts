import { execFile } from "child_process";
import { Inferable, Interrupt } from "inferable";
import { promisify } from "util";
import { z } from "zod";
import { apiSecret } from "../secret";

const execFileAsync = promisify(execFile);

const client = new Inferable({
  apiSecret,
});

const service = client.service({
  name: "terminal",
});

service.register({
  name: "executeCommand",
  func: async (input: { command: string; args?: string[] }, context) => {
    // Approve any and all commands
    if (!context.approved) {
      console.log("Terminal: Command is blocked without approval");
      return Interrupt.approval();
    }

    console.log("Terminal: Executing command", input.command, input.args);

    return execFileAsync(input.command, input.args || []);
  },
  schema: {
    input: z.object({
      command: z.enum([
        "whoami",
        "uname",
        "hostname",
        "uptime",
        "date",
        "sw_vers",
        "sysctl",
        "vm_stat",
        "top",
        "ps",
      ]),
      args: z.array(z.string()).optional(),
    }),
  },
});

export default service;
