import { AnyRouter, initTRPC } from "@trpc/server";
import { Inferable } from "inferable";
import { ContextInput, RegisteredService } from "inferable/bin/types";

type FunctionConfig = {
  path: string;
  description: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs: any | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (input: unknown, ctx: ContextInput) => any;
};

type Procedure = {
  _def?: {
    meta?: {
      description?: string;
      inferable?: {
        enabled: boolean;
        additionalContext?: string;
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs?: any;
  };
};

function camelCase(str: string) {
  return str
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function inferableTRPC() {
  const t = initTRPC.context().meta().create();

  return {
    proc: t.procedure.meta({ inferable: true }).use(async (opts) => {
      return opts.next({
        ctx: opts.ctx as ContextInput,
      });
    }),
  };
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

  for (const [path, procedure] of Object.entries(router._def.procedures) as [
    string,
    Procedure
  ][]) {
    if (procedure._def?.meta?.inferable) {
      fns.push({
        path,
        description:
          [
            procedure._def?.meta?.description,
            procedure._def?.meta?.inferable?.additionalContext,
          ]
            .filter(Boolean)
            .join("\n") || undefined,
        inputs: procedure._def?.inputs,
        fn: async (input: unknown, ctx: ContextInput) => {
          const context = contextGetter ? await contextGetter() : {};
          const caller = createCaller({ ...ctx, context });

          if (typeof caller[path] !== "function") {
            throw new Error(
              `Procedure ${path} is not a function. Got ${typeof caller[path]}`
            );
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = caller[path] as (input: unknown) => any;

          return fn(input);
        },
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
