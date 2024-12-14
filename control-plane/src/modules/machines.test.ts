import { upsertMachine } from "./machines";
import { createCluster, getClusterMachines } from "./management";
import * as redis from "./redis";
import {
  getServiceDefinitions,
  upsertServiceDefinition,
} from "./service-definitions";

describe("machines", () => {
  beforeAll(async () => {
    redis.start();
  });
  afterAll(async () => {
    redis.stop();
  });
  describe("upsertMachine", () => {
    it("should record machine details", async () => {
      const { id } = await createCluster({
        organizationId: Math.random().toString(),
        description: "description",
      });

      const machineId = Math.random().toString();

      const services = ["service1", "service2"];

      await Promise.all(
        services.map((service) =>
          upsertServiceDefinition({
            service,
            definition: {
              name: service,
              functions: [],
            },
            owner: { clusterId: id },
          }),
        ),
      );

      const timeBeforePing = Date.now();

      await upsertMachine({
        clusterId: id,
        machineId,
        sdkVersion: "sdk-version",
        sdkLanguage: "sdk-language",
        ip: "1.2.3.4",
      });

      const machines = await getClusterMachines({
        clusterId: id,
      });

      expect(machines).toHaveLength(1);
      expect(machines[0].id).toBe(machineId);
      expect(machines[0].lastPingAt).toBeInstanceOf(Date);
      expect(machines[0].lastPingAt?.getTime()).toBeGreaterThanOrEqual(
        timeBeforePing,
      );

      expect(
        await getServiceDefinitions({
          clusterId: id,
        }).then((services) => services.map((s) => s.service)),
      ).toEqual(services);
    });
  });
});
