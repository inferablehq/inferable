import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { fetchValTownMeta, executeValTownFunction } from "./valtown";

const server = setupServer();

const config = {
  endpoint: "https://inferable.web.val.run",
  token: "sk-inf-val-1234567890",
};

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Val.town Integration", () => {
  describe("fetchValTownMeta", () => {
    it("should fetch and parse metadata", async () => {
      const mockMeta = {
        description: "Test description",
        functions: [
          {
            name: "testFunction",
            description: "A test function",
            input: {
              type: "object",
              properties: {
                test: { type: "string" },
              },
              required: ["test"],
            },
          },
        ],
      };

      server.use(
        http.get("*/meta", ({ request }) => {
          // Verify auth header
          expect(request.headers.get("Authorization")).toBe(`Bearer ${config.token}`);
          return HttpResponse.json(mockMeta);
        })
      );

      const result = await fetchValTownMeta({
        endpoint: "https://api.val.town",
        token: config.token,
      });

      expect(result).toEqual(mockMeta);
    });
  });

  describe("executeValTownFunction", () => {
    it("should execute function and return result", async () => {
      const mockResponse = { result: "success" };

      server.use(
        http.post<any>("*/exec/functions/testFn", async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual({ param: "value" });

          // Verify auth header
          expect(request.headers.get("Authorization")).toBe(`Bearer ${config.token}`);

          return HttpResponse.json(mockResponse);
        })
      );

      const result = await executeValTownFunction({
        endpoint: "https://api.val.town",
        functionName: "testFn",
        params: { param: "value" },
        token: config.token,
      });

      expect(result).toEqual(mockResponse);
    });
  });
});
