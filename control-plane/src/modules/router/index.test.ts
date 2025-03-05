import { initServer } from "@ts-rest/fastify";
import fastify from "fastify";
import * as auth from "../auth/auth";
import { router } from ".";

describe("router", () => {
  const port = Math.floor(Math.random() * 1000) + 3000;
  const host = `0.0.0.0`;

  const endpoint = `http://${host}:${port}`;

  const app = fastify();
  const s = initServer();
  app.register(auth.plugin);
  app.register(s.plugin(router), (parent) => parent);

  beforeAll(async () => {
    await app.listen({ port, host: "0.0.0.0" });
  });

  describe("live", () => {
    it("should return 200", async () => {
      const response = await fetch(`${endpoint}/live`);
      expect(response.status).toBe(200);
    });
  });
});
