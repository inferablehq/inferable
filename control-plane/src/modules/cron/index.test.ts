import { registerCron, start } from ".";

describe("cron", () => {
  // Increase timeout for all tests in this suite to account for BullMQ initialization
  jest.setTimeout(30000);

  it("should execute a cron job multiple times", async () => {
    // Counter to track how many times the cron job has fired
    let executionCount = 0;

    // Register a cron job that increments the counter every second
    await registerCron(
      async () => {
        executionCount++;
      },
      "test-cron",
      { interval: 1000 }, // 1 second interval
    );

    await start();

    // Wait for 5 seconds to allow the cron to fire multiple times
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Assert that the cron job has fired more than once
    expect(executionCount).toBeGreaterThan(1);
  }, 15000); // Set timeout to 15 seconds to ensure test has enough time to complete
});
