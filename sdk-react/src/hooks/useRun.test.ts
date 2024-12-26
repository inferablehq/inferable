import { renderHook, act } from "@testing-library/react";
import { useRun, useRuns } from "./useRun";
import { createApiClient } from "../createClient";
import { jest } from "@jest/globals";

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
  });

  it("should create a new run when runId is not provided", async () => {
    const newRunId = "new-run-123";
    const mockResponse = {
      status: 201,
      body: { id: newRunId },
      headers: new Headers(),
    };

    mockApiClient.createRun.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() =>
      useRun({
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
        apiClient: mockApiClient as unknown as ApiClient,
      })
    );

    // Wait for the effect to run
    await act(async () => {});

    expect(mockApiClient.createRun).toHaveBeenCalledWith({
      body: { runId: undefined },
      params: { clusterId: "test-cluster" },
    });
  });

  it("should use existing runId when provided", async () => {
    const existingRunId = "existing-run-123";

    const { result } = renderHook(() =>
      useRun({
        runId: existingRunId,
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
        apiClient: mockApiClient as unknown as ApiClient,
      })
    );

    // Wait for the effect to run
    await act(async () => {});

    expect(mockApiClient.createRun).not.toHaveBeenCalled();
  });

  it("should poll for messages and run status", async () => {
    const runId = "test-run-123";
    const mockMessages = [
      {
        id: "1",
        type: "human" as const,
        message: "test",
        createdAt: new Date(),
        data: { id: "1", result: {} },
        pending: false,
        displayableContext: null,
      },
    ];
    const mockRun = {
      id: runId,
      status: "running" as const,
      attachedFunctions: null,
      metadata: null,
      test: false,
      result: null,
      createdAt: new Date(),
      configId: null,
      userId: null,
      configVersion: null,
      feedbackScore: null,
      authContext: null,
    };

    const mockMessagesResponse = {
      status: 200,
      body: mockMessages,
      headers: new Headers(),
    };

    const mockRunResponse = {
      status: 200,
      body: mockRun,
      headers: new Headers(),
    };

    mockApiClient.listMessages.mockResolvedValueOnce(mockMessagesResponse);
    mockApiClient.getRun.mockResolvedValueOnce(mockRunResponse);

    const { result } = renderHook(() =>
      useRun({
        runId,
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
        apiClient: mockApiClient as unknown as ApiClient,
      })
    );

    // Advance timers and wait for the polling to occur
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(mockApiClient.listMessages).toHaveBeenCalledWith({
      params: {
        clusterId: "test-cluster",
        runId,
      },
    });

    expect(mockApiClient.getRun).toHaveBeenCalledWith({
      params: {
        clusterId: "test-cluster",
        runId,
      },
    });

    expect(result.current.messages).toEqual(mockMessages);
    expect(result.current.run).toEqual(mockRun);
  });

  it("should create a message", async () => {
    const runId = "test-run-123";
    const messageInput = { message: "test message", type: "human" as const };

    const mockResponse = {
      status: 201,
      body: undefined,
      headers: new Headers(),
    };

    mockApiClient.createMessage.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() =>
      useRun({
        runId,
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
        apiClient: mockApiClient as unknown as ApiClient,
      })
    );

    await act(async () => {
      await result.current.createMessage(messageInput);
    });

    expect(mockApiClient.createMessage).toHaveBeenCalledWith({
      params: {
        clusterId: "test-cluster",
        runId,
      },
      body: messageInput,
    });
  });
});

describe("useRuns", () => {
  let mockApiClient: MockApiClient;

  beforeEach(() => {
    mockApiClient = createMockApiClient();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should poll for runs", async () => {
    const mockRuns = [
      {
        id: "1",
        status: "running" as const,
        name: "test run",
        createdAt: new Date(),
        test: false,
        configId: null,
        userId: null,
        configVersion: null,
        feedbackScore: null,
      },
    ];

    const mockResponse = {
      status: 200,
      body: mockRuns,
      headers: new Headers(),
    };

    mockApiClient.listRuns.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() =>
      useRuns({
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
        apiClient: mockApiClient as unknown as ApiClient,
      })
    );

    // Advance timers and wait for the polling to occur
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockApiClient.listRuns).toHaveBeenCalledWith({
      params: {
        clusterId: "test-cluster",
      },
    });

    expect(result.current.runs).toEqual(mockRuns);
  });
});
