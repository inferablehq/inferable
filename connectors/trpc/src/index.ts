import { AnyRouter, initTRPC } from "@trpc/server";
import { Inferable } from "inferable";
import { RegisteredService } from "inferable/bin/types";

type FunctionConfig = {
  path: string;
  description: string | undefined;
  inputs: any | undefined;
  fn: (input: unknown) => any;
};

type Procedure = {
  _def?: {
    meta?: {
      description?: string;
      inferable?: boolean;
    };
    inputs?: any;
  };
};

function camelCase(str: string) {
  return str
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function createInferableService({
  name,
  router,
  createCaller,
  contextGetter,
  client,
}: {
  router: AnyRouter;
  createCaller: ReturnType<
    ReturnType<typeof initTRPC.create>["createCallerFactory"]
  >;
  name: string;
  contextGetter?: () => Promise<object> | object;
  client: Inferable;
}): RegisteredService {
  const fns: FunctionConfig[] = [];

  const caller = createCaller(contextGetter?.() ?? {});

  for (const [path, procedure] of Object.entries(router._def.procedures) as [
    string,
    Procedure
  ][]) {
    if (procedure._def?.meta?.inferable) {
      if (typeof caller[path] !== "function") {
        throw new Error(
          `Procedure ${path} is not a function. Got ${typeof caller[path]}`
        );
      }

      fns.push({
        path,
        description: procedure._def?.meta?.description,
        inputs: procedure._def?.inputs,
        fn: caller[path],
      });
    }
  }

  const service = client.service({
    name,
  });

  for (const fn of fns) {
    service.register({
      name: camelCase(fn.path),
      description: fn.description,
      schema: {
        input: fn.inputs[0],
      },
      func: fn.fn,
    });
  }

  return service;
}
