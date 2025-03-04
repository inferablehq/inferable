import { renderHook } from "@testing-library/react";
import { useInferable } from "./useInferable";

describe("useInferable", () => {
  it("should initialize with cluster auth", () => {
    const { result } = renderHook(() =>
      useInferable({
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
      }),
    );

    expect(result.current.clusterId).toBe("test-cluster");
    expect(result.current.client).toBeDefined();
  });

  it("should initialize with custom auth", () => {
    const { result } = renderHook(() =>
      useInferable({
        clusterId: "test-cluster",
        authType: "custom",
        customAuthToken: "test-token",
      }),
    );

    expect(result.current.clusterId).toBe("test-cluster");
    expect(result.current.client).toBeDefined();
  });

  it("should use custom base URL when provided", () => {
    const { result } = renderHook(() =>
      useInferable({
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
        baseUrl: "https://custom-api.example.com",
      }),
    );

    expect(result.current.clusterId).toBe("test-cluster");
    expect(result.current.client).toBeDefined();
  });

  it("should handle client methods", async () => {
    const { result } = renderHook(() =>
      useInferable({
        clusterId: "test-cluster",
        authType: "cluster",
        apiSecret: "test-secret",
      }),
    );

    expect(typeof result.current.createRun).toBe("function");
    expect(typeof result.current.listRuns).toBe("function");
  });
});
