import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { signedHeaders, fetchValTownMeta, executeValTownFunction } from "./valtown";

const server = setupServer();

const config = {
  endpoint: "https://inferable.web.val.run",
  publicKey:
    '{"alg":"RS256","e":"AQAB","ext":true,"key_ops":[],"kty":"RSA","n":"wm3rV26ECbwcbW-83IZU6UiptRq6JroEMSz71S_JpuId83KyzjCPKCpI9lEcCg6ClSD_-gJQ1htUTqGpOwiYlYTCQARPvjYXPyRqjRy8Mjn6LsCM5UqTjMX3jXJm92X-NEgKtzAPeuAZ5tULWrZnBKNNmdhUp8JrW9wCAb2fWo64h5mWtun5Q8xELhzzhKHZD25O3UbB0OAb1iEArNsVwsH0afT_yLvx2K9ETVLS8u0j-Psl-FJwY-uJmwRxqE08viND_T4OldyHocrE8-dJaxgrp77YiYAKoKeZyoqzFXYKyqu-MwmWs20NP9dOgq5z61bmMiLUWE4phooL3r2alQ"}',
  privateKey:
    '{"alg":"RS256","d":"Gm_mTnznRMiYh_Pn1weH_7GC6-5-rdngzIv8kTQehAvefTYVJI67RH-dbKrCOIbZECyMyeKrObW9HLUEJRQJ5VjILfq4GhnSRuJtf5MO7vhtsZI6hkoB7qQTgV7zK8QpUNQT6u1EyZUzyGyjDtpa_ykyWc8t0aLQxMyRVEnDo4Uj9ZaPysEoPm6ZHOiK_0oPbFzoPjfCm3HqFx8lzTlpJVSdjCi8uz4yeldfkai-_jV4vpbP0g6zQi28L3hQUkvPiLuOv_WZOhjgUtpHUnmXlENV7pQ_8L5EVqiXDNUNsiimpYOqaGYChjGgjUE94Rcrs4AXOE187iQuhaDp0LfMAQ","dp":"K8trecJdBBHf90EC6FwV-M8jwsk9CV3ppcBICVzWvC1eVBiv6Bhn576AHvBHlP5XWa2IRZpE2JDd7nBUoZFcGrNontJJU2w0EMHkdxsK6C_hHbf5llPgM9m04FzaT6XggyYhOHIZvXU84KTSkDJhN6CzNcs3LqW3hTmqstBowAE","dq":"NYlCeQZi-sRbT3tntMJIWh6VytGgUa1MpLUZh26xgd3WpUdmIKFObKZaMwBANJklNCWeniQrzvG7PrZcpFMo6zwVpB3k_Tj-MDCzADmycBPjadGAMHXfH0jGVJc33B9T8-HK7nD8JsZc2FqxAHbhiTkfZz0wCzfVNiTsvys_i9E","e":"AQAB","ext":true,"key_ops":["sign"],"kty":"RSA","n":"wm3rV26ECbwcbW-83IZU6UiptRq6JroEMSz71S_JpuId83KyzjCPKCpI9lEcCg6ClSD_-gJQ1htUTqGpOwiYlYTCQARPvjYXPyRqjRy8Mjn6LsCM5UqTjMX3jXJm92X-NEgKtzAPeuAZ5tULWrZnBKNNmdhUp8JrW9wCAb2fWo64h5mWtun5Q8xELhzzhKHZD25O3UbB0OAb1iEArNsVwsH0afT_yLvx2K9ETVLS8u0j-Psl-FJwY-uJmwRxqE08viND_T4OldyHocrE8-dJaxgrp77YiYAKoKeZyoqzFXYKyqu-MwmWs20NP9dOgq5z61bmMiLUWE4phooL3r2alQ","p":"-jBc8mJWjEsRsuaFB3m26lWdJFn4j2suI-0G_8Byz-QHLG4PA2YdR-icU-oCQorO6C_jJkKkqQJJiRDZe1BIZFF632U5nIIhfoa4ysoholacsDmloVOxn3ZgRPKrqOK53ShxggmwXpf5WPETZHCAC3fZ8PgT24MsKRYijf55DAE","q":"xvIBxmn3EzWQdWKFbmgfiLkajiFB8xNPhHeVlAGF9afAaHwwMVhqkvgHVekrcYhqkIB5wTdcxZxlRLZAI_8H7mvk1FRwkkojUctw8jDtgO8Jx4SWS6-ieinFUW1H_RXGVPi5kqqCwSd6NEABUrz3WaFADH38hajLp-Qr9IDhnpU","qi":"6nQ9U91UzdOf9CHxeGxvYIt0oYOsFPuGIAdlaNGv0k510ypgmgTUE5PKH1JIZR3R5i41kE77XNYmF9PImCdyl6GTbaQIwQnmcjeqyTHhRRae9irIhKVFfFazRY64YpMfc3ZgUmG4ht5NacLd0QmJjmduFuc9Z-LIcaL7VisWcpo"}',
};

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Val.town Integration", () => {
  describe("signedHeaders", () => {
    it("should sign headers", async () => {
      const result = signedHeaders({
        body: JSON.stringify({ test: "value" }),
        method: "GET",
        path: "/meta",
        privateKey: JSON.parse(config.privateKey),
        timestamp: "819118800000",
      });

      expect(result).toStrictEqual({
        "X-Signature": expect.any(String),
        "X-Timestamp": "819118800000",
      });
    });

    it("should return empty object when privateKey is missing", () => {
      const result = signedHeaders({
        body: "",
        method: "GET",
        path: "/meta",
        privateKey: null,
      });

      expect(result).toStrictEqual({});
    });
  });

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
        http.get("*/meta", () => {
          return HttpResponse.json(mockMeta);
        })
      );

      const result = await fetchValTownMeta({
        endpoint: "https://api.val.town",
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

          const headers = request.headers;
          expect(headers.get("X-Signature")).toBeTruthy();
          expect(headers.get("X-Timestamp")).toBeTruthy();

          return HttpResponse.json(mockResponse);
        })
      );

      const result = await executeValTownFunction({
        endpoint: "https://api.val.town",
        functionName: "testFn",
        params: { param: "value" },
        privateKey: JSON.parse(config.privateKey),
      });

      expect(result).toEqual(mockResponse);
    });
  });
});
