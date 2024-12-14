import { CommandModule } from "yargs";
import { getToken, startTokenFlow } from "../lib/auth";
import readline from "readline";
import { createCluster } from "./clusters-create";
import { createApiKey } from "./auth-keys";
import { downloadProject } from "../utils";
import { appendFile } from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import inquirer from "inquirer";
import crypto from "crypto";

const execAsync = promisify(exec);

interface BootstrapArgs {
  dir?: string;
  type?: string;
}

const projectMap: Record<
  string,
  {
    url: string;
    ref: string;
  }
> = {
  node: {
    url: "https://git.inferable.ai/inferablehq/inferable/raw/refs/heads/main/archives/bootstrap-node.zip",
    ref: "bootstrap-node",
  },
  go: {
    url: "https://git.inferable.ai/inferablehq/inferable/raw/refs/heads/main/archives/bootstrap-go.zip",
    ref: "bootstrap-go",
  },
  dotnet: {
    url: "https://git.inferable.ai/inferablehq/inferable/raw/refs/heads/main/archives/bootstrap-dotnet.zip",
    ref: "bootstrap-dotnet",
  },
  proxy: {
    url: "https://github.com/inferablehq/proxy/archive/refs/heads/main.zip",
    ref: "proxy-main",
  },
};

export const Bootstrap: CommandModule<{}, BootstrapArgs> = {
  command: "bootstrap [type]",
  aliases: ["b"],
  describe: "Bootstrap a new Inferable project",
  builder: (yargs) =>
    yargs
      .positional("type", {
        describe: "Project type to create",
        type: "string",
        choices: ["node", "go", "dotnet", "proxy"],
        demandOption: false,
      })
      .option("dir", {
        describe: "Directory to create the application in",
        type: "string",
        demandOption: false,
      }),
  handler: async ({
    dir: providedDir,
    type: providedType,
    "no-cluster": noCluster,
  }) => {
    const { type } = providedType
      ? { type: providedType }
      : await inquirer.prompt([
          {
            type: "list",
            name: "type",
            message: "What type of project would you like to create?",
            choices: Object.keys(projectMap),
            default: providedType,
          },
        ]);

    const { dir } =
      providedDir === undefined
        ? await inquirer.prompt([
            {
              type: "input",
              name: "dir",
              message: "Where would you like to create the project?",
              default:
                providedDir ||
                `inferable-app-${crypto.randomBytes(5).toString("hex")}`,
            },
          ])
        : { dir: providedDir };

    const proxyRepo = projectMap[type];
    console.log(`Downloading ${proxyRepo.url}...`);
    await downloadProject(proxyRepo.url, proxyRepo.ref, dir);

    switch (type) {
      case "proxy":
      case "node":
        console.log("Installing dependencies...");
        try {
          await execAsync("npm install", { cwd: dir });
          console.log(`✅ Inferable ${type} project created in ${dir}`);
        } catch (error) {
          console.error("❌ Failed to install dependencies:", error);
          process.exit(1);
        }
        break;
      case "go":
        console.log("Installing dependencies...");
        try {
          await execAsync("go mod tidy", { cwd: dir });
        } catch (error) {
          console.error("❌ Failed to install dependencies:", error);
          process.exit(1);
        }
        break;
    }
  },
};
