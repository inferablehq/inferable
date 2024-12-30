import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { signedHeaders, fetchValTownMeta, executeValTownFunction } from "./valtown";

const server = setupServer();

const privateKey =
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCbG8duYpxNeadWdSGxgPqhutRLpkNC3oZI8ySzeFbXu2o1PPEZRGyjq8uvp+zeg+bTtV7ArRKRi+KxnXOkDMQQT+eZjSxFYbw5Q6CClVlJbxE8+g15BSomIxvCGProZ6WHirjVMbiSpt6YBzyagNfpJVbPDm037hVYZjst40wwHBHUvxf1GA6MxKml36eH2at6nkRoKPF33CilYWzoJeHEt0gu2fgPkZUR38BgbS+8pvWic/xWy6D8Q5jzptpsNxmmIjrJq+KykinTUgT6FCNW8cbeTzsnBVF5IYeqgO58gIIJXslEx9EefeYAb7Recxj0W0TCFDrBDGMaLJM0ob7vAgMBAAECggEAJo9a3nXUXqxaLfOzmyGx7Sf5pA7i1MpmPtd3bciCamJUroSGeZ4ZlfzdB7+q8sx+w23o7uR348gPZNF8ULG9wkJjFLjUYzE/bksCKcSALHHYqryNQeNHTbDXs0KricBOleomNhYEySyD1O6jodNbGcJnGNWA0HE3TEEqACfsJl9IxMDNk7TOfJgmHQMqPcbValkVywSJMp2qDDKoxGzdp7ZiKZlZq+MujGBNqKh/AacYZKVn+B9hxedTRZXCDQebuqklpJbFAL0P1S5s6E8cx7xtvicQ7BPBseX3PH5Rs9CwqzZYPVEeSoystIpqVPnSn6QD/Ux7VicqIAvIglHCPQKBgQDUj4wZHv/gSkqFKgfagHREGak8VAUn5e+u0mOV7dIsxsPgic7dHvpI0lzVx59IXC8I8kmEPrLw43BTaRgvhvZxllQY8XzOZlukne2inpEpCEOHYrcmbSJJhpoabDIy5C3iy0zErIa9f0UVTyOx8NTS1G6odra7TfCqnPKp+/XdiwKBgQC6zocLrmvtN+J0ygJw+gX8MPxyHVObEtdW86/Be0GApMvJgQWN7AdcuNT1wOie6kaJ5fYu4U70GOb9Bz7QL2oMM+Y7FVLXDqA2BzdVmFPYkQxMBzRx+qLjJ0488WqUoBIhGh6QufPSvcqoLoSNx0fYKNrSV2DJnJkIiNLbquIYrQKBgE7IDWLaLHgS0N/eHh8L8Qu0fxcPBQIupNEkxSgyhu11le/I49TswFLxNNs/K3gEQqKMOlc7bdL+WQlxMDedTAX5c53zExDkux6eMg9Nuft9RpoNKlihpk2eB8u3Qju+eotOUluqnh3p587oEBDJc/fYKFNj/IIbdxGlLgN2kT/VAoGAPTw0Io0jjdhS4GvTzwr2aUv5hMK+REgx1Kv/AhKQT0Y2EzC7DGHBrBBepsx8tJMhWlTKlWWABx4eofT9DytrvOJKZzW/OQXvWKaW6fUMDyLFACsgcvhw6rtYtzt/74ZlSvqP6Gs8VOmoA+dzxjH8CAykZm0EKjKuK5EGZcGnaeUCgYEAuhZVvmLg70Gr+S02KfsVLMqORv+Hvy84ew5EM3vLTTkwOYhfVK9HNYLjh5yX9EdgjhJtAmCE0pG1NIed/86EY67/cB/4yI/UMB9MP/+xjWbxa0UkWGibwhM2ZmgZQXweL1Y1oTpTP342j0MkMI/7T+viq18IgcxqI3YIPI9Azgk=";

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
        privateKey,
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
        privateKey: "",
      });

      expect(result).toStrictEqual({});
    });
  });

  describe("fetchValTownMeta", () => {
    it("should fetch and parse metadata", async () => {
      const mockMeta = {
        endpoint: "https://api.val.town",
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
        privateKey,
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
        privateKey,
      });

      expect(result).toEqual(mockResponse);
    });
  });
});
