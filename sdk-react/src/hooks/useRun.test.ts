import { renderHook, act } from "@testing-library/react";
import { useRun } from "./useRun";
import { createApiClient } from "../createClient";
import { jest } from "@jest/globals";
import { z } from "zod";

type ApiClient = ReturnType<typeof createApiClient>;

const createMockApiClient = () => ({
  createRun: jest.fn() as jest.Mock<any>,
  listMessages: jest.fn() as jest.Mock<any>,
  getRun: jest.fn() as jest.Mock<any>,
  createMessage: jest.fn() as jest.Mock<any>,
  listRuns: jest.fn() as jest.Mock<any>,
});

type MockApiClient = ReturnType<typeof createMockApiClient>;

describe("useRun", () => {
  let mockApiClient: MockApiClient;

  beforeEach(() => {
    mockApiClient = createMockApiClient();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const mockSchema = z.object({
    result: z.any(),
  });

  const createMockInferable = (client: MockApiClient) => ({
    client: client as unknown as ApiClient,
    clusterId: "test-cluster",
    createRun: async () => {
      const response = await client.createRun({
        body: { runId: undefined },
        params: { clusterId: "test-cluster" },
      });
      return response.body;
    },
    listRuns: async () => ({ runs: [] }),
  });

  it("should use existing runId when provided", async () => {
    const existingRunId = "existing-run-123";
    mockApiClient.listMessages.mockResolvedValue({ status: 200, body: [], headers: new Headers() });
    mockApiClient.getRun.mockResolvedValue({
      status: 200,
      body: { id: existingRunId, status: "running" },
      headers: new Headers(),
    });

    const mockInferable = createMockInferable(mockApiClient);

    const { result } = renderHook(() => useRun(mockInferable));

    await act(async () => {
      result.current.setRunId(existingRunId);
      await Promise.resolve();
      jest.runAllTimers();
    });

    expect(mockApiClient.createRun).not.toHaveBeenCalled();
  });

  it("should create a message", async () => {
    const runId = "test-run-123";
    const messageText = "test message";

    mockApiClient.listMessages.mockResolvedValue({ status: 200, body: [], headers: new Headers() });
    mockApiClient.getRun.mockResolvedValue({
      status: 200,
      body: { id: runId, status: "running" },
      headers: new Headers(),
    });
    mockApiClient.createMessage.mockResolvedValueOnce({
      status: 201,
      body: undefined,
      headers: new Headers(),
    });

    const mockInferable = createMockInferable(mockApiClient);

    const { result } = renderHook(() => useRun(mockInferable));

    await act(async () => {
      result.current.setRunId(runId);
      await Promise.resolve();
      jest.runAllTimers();
    });

    await act(async () => {
      await result.current.createMessage(messageText);
    });

    expect(mockApiClient.createMessage).toHaveBeenCalledWith({
      params: {
        clusterId: "test-cluster",
        runId,
      },
      body: { message: messageText, type: "human" },
    });
  });
});
