import { execFile } from "child_process";
import { Inferable, Interrupt } from "inferable";
import { promisify } from "util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const register = (client: Inferable) => {
  client.tools.register({
    name: "executeCommand",
    description: "Executes a command on the terminal, but asks for approval first.",
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
}
