import { cleanupConflictingIntegrations } from ".";
import { createOwner } from "../../test/util";
import { getIntegrations, upsertIntegrations } from "../integrations";
import { nango } from "../nango";

jest.mock("../nango", () => ({
  nango: {
    deleteConnection: jest.fn(),
  },
}));

describe("cleanupConflictingIntegrations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should cleanup duplicate integrations for team ID", async () => {
    const owner1 = await createOwner();
    const owner2 = await createOwner();

    await upsertIntegrations({
      clusterId: owner1.clusterId,
      config: {
        slack: {
          teamId: "team1",
          nangoConnectionId: "connection1",
          botUserId: "bot1",
        },
      },
    });

    await cleanupConflictingIntegrations(owner2.clusterId, {
      slack: {
        teamId: "team1",
        nangoConnectionId: "connection1",
        botUserId: "bot1",
      },
    });

    const owner1Integrations = await getIntegrations({
      clusterId: owner1.clusterId,
    });
    expect(owner1Integrations.slack).toBeNull();
    expect((nango as any).deleteConnection).toHaveBeenCalledTimes(1);
  });

  it("should not cleanup integrations for other teams", async () => {
    const owner1 = await createOwner();
    const owner2 = await createOwner();

    await upsertIntegrations({
      clusterId: owner1.clusterId,
      config: {
        slack: {
          teamId: "team1",
          nangoConnectionId: "connection1",
          botUserId: "bot1",
        },
      },
    });

    await cleanupConflictingIntegrations(owner2.clusterId, {
      slack: {
        teamId: "team2",
        nangoConnectionId: "connection2",
        botUserId: "bot2",
      },
    });

    const owner1Integrations = await getIntegrations({
      clusterId: owner1.clusterId,
    });
    expect(owner1Integrations.slack).not.toBeNull();
    expect((nango as any).deleteConnection).not.toHaveBeenCalled();
  });
});
