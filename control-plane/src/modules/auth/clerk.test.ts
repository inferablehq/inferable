import * as clerkAuth from "./clerk";
import { env } from "../../utilities/env";

jest.mock("../../utilities/env");

describe("verify", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  // This test needs to be run with the test environment's Clerk API JWKS_URL
  if (process.env.CI) {
    it("should verify a correct token", async () => {
      env.JWT_IGNORE_EXPIRATION = true;

      const token = `eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18yYTY1VkFobFJsSFRiRjVhS21zMHZhRVRxQUkiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL2FwcC5pbmZlcmFibGUuYWkiLCJleHAiOjE3MTcyOTYxODAsImlhdCI6MTcxNzI5NjEyMCwiaXNzIjoiaHR0cHM6Ly9jbGVyay5pbmZlcmFibGUuYWkiLCJuYmYiOjE3MTcyOTYxMTAsIm9yZ19pZCI6Im9yZ18yaEEwMURsZWRlbnN0VmdvcWJTVzNuTmREcGQiLCJvcmdfcGVybWlzc2lvbnMiOltdLCJvcmdfcm9sZSI6Im9yZzptZW1iZXIiLCJvcmdfc2x1ZyI6ImZhcm1lci1qb2huLXMtb2xkLXN0eWxlLWFpIiwic2lkIjoic2Vzc18yaEl5c3ZBYzJFYmI5WmN5ekx3Mlp3bXhCZ2siLCJzdWIiOiJ1c2VyXzJoQTZ4RGhyR2l5dHhneW5OakdBY1h1dTUwMiJ9.dkWp3i_pSqtokKoJY_rv7GeumdMQ3rJLLlzGOof9RoDxk342OxAoMX8J2bYOZ4vibOdvjg5dqTnMHpFoL3JatJloyAyZdjeh_AsrHTXKF_re5WF4wHizyClCvGAYN6i_LxSGZkzmvw7I3EINnlCNX0IIlp8DH1RkvNkXENMNFkxgNq_III0nWIwLR1ApNs_zb6vGHhm-ZJ5wFOTBa7GIWSvVSubgg9aLMyL9_Saiv8DRbNGDEuAyw_1pymgw3JfJLHBAFFaOMZtyxj5ac5z1NJcj7rAIJop5TnQ9AmTLn46nLXh1jUGLER2WgMbLMLSDyLf2xQaYf1zf-MvSuyBrBQ`;

      const result = await clerkAuth.verify(token);

      //https://dashboard.clerk.com/apps/app_2a1wfBvkKUk9n3t8DBzK0LD6vhY/instances/ins_2a65VAhlRlHTbF5aKms0vaETqAI/users/user_2hA6xDhrGiytxgynNjGAcXuu502
      expect(result).toEqual({
        userId: "user_2hA6xDhrGiytxgynNjGAcXuu502",
        orgId: "org_2hA01DledenstVgoqbSW3nNdDpd",
        orgRole: "org:member",
      });
    });
  }

  it("should return undefined on malformed token", async () => {
    const token = `1234`;

    await expect(clerkAuth.verify(token)).resolves.toBeUndefined();
  });
});
