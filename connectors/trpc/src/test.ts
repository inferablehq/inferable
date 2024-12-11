import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import assert from "assert";
import { approvalRequest, Inferable } from "inferable";
import { z } from "zod";
import { createInferableService, inferableTRPC } from ".";

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

const users = [
  { id: "1", name: "John Doe", email: "john.doe@example.com" },
  { id: "2", name: "Jane Doe", email: "jane.doe@example.com" },
];

const plugin = inferableTRPC();

const appRouter = t.router({
  "": publicProcedure.query(() => {
    return `Inferable TRPC Connector Test`;
  }),
  userById: publicProcedure
    .unstable_concat(plugin.proc)
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) => {
      if (input.id === "dangerous" && !ctx.approved) {
        return approvalRequest();
      }

      return users.find((user) => user.id === input.id);
    }),
  users: router({
    create: publicProcedure
      .unstable_concat(plugin.proc)
      .input(z.object({ name: z.string(), email: z.string() }))
      .mutation(({ input }) => {
        const newUser = { id: (users.length + 1).toString(), ...input };
        users.push(newUser);
        return newUser;
      }),
  }),
});

const { server } = createHTTPServer({
  router: appRouter,
});

const client = new Inferable({
  apiSecret: process.env.INFERABLE_API_SECRET,
});

const service = createInferableService({
  router: appRouter,
  createCaller: t.createCallerFactory(appRouter),
  name: "trpcTest",
  client,
});

service
  .start()
  .then(() => {
    console.log("Inferable service started");
  })
  .then(() => {
    return client
      .run({
        initialPrompt: `Get the user with id 1`,
        resultSchema: z.object({
          id: z.string(),
          firstName: z.string(),
          lastName: z.string(),
          email: z.string(),
        }),
      })
      .then((r) => r.poll());
  })
  .then((r) => {
    assert(r);
    assert(r.result);
    assert.equal(r.result.id, "1");
    assert.equal(r.result.firstName, "John");
    assert.equal(r.result.lastName, "Doe");
    assert.equal(r.result.email, "john.doe@example.com");
    console.log("Test passed");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

server.listen(8001).on("listening", () => {
  console.log("Server is running on port 8001");
});
