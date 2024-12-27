import { webApi } from "@slack/bolt";
import { authenticateUser, handleNewRunMessage } from "./index";
import { AuthenticationError } from "../../../utilities/errors";

describe("slack", () => {
  const client = {
    chat: {
      postMessage: jest.fn(),
    },
    users: {
      info: jest.fn(),
    },
  } as unknown as webApi.WebClient;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("handleNewRunMessage", () => {
    it("should not send message if metadata is missing", async () => {
      const message = {
        id: "123",
        clusterId: "cluster-1",
        runId: "run-1",
        type: "agent" as const,
        data: {
          message: "test message",
        },
      };

      await handleNewRunMessage({ message, client });

      expect(client.chat.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("authenticateUser", () => {
    it("should fail is user key is missing", async () => {
      await expect(
        authenticateUser({
          event: {} as any,
          client,
        })
      ).rejects.toThrow(Error);
    });

    it("should fail if user is not confirmed", async () => {
      (client.users.info as jest.Mock).mockResolvedValueOnce({
        user: { is_email_confirmed: false },
      });

      await expect(
        authenticateUser({
          event: { user: "U123" } as any,
          client,
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it("should fail if user email is missing", async () => {
      (client.users.info as jest.Mock).mockResolvedValueOnce({
        user: { is_email_confirmed: true },
      });
      await expect(
        authenticateUser({
          event: { user: "U123" } as any,
          client,
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it("should fail if user email is not in authorized list", async () => {
      (client.users.info as jest.Mock).mockResolvedValueOnce({
        user: {
          is_email_confirmed: true,
          profile: { email: "xHw0o@example.com" },
        },
      });

      await expect(
        authenticateUser({
          event: { user: "U123" } as any,
          client,
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it("should succeed if user is confirmed and email is in authorized list", async () => {
      (client.users.info as jest.Mock).mockResolvedValueOnce({
        user: {
          is_email_confirmed: true,
          profile: { email: "xHw0o@example.com" },
        },
      });
      await expect(
        authenticateUser({
          event: { user: "U123" } as any,
          client,
          authorizedUsers: ["xHw0o@example.com"],
        })
      ).resolves.toBeTruthy();
    });
  });
});
