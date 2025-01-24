import { renderHook } from "@testing-library/react";
import { UnifiedMessage } from "../contract";
import { useMessages } from "./useMessages";

describe("useMessages", () => {
  const mockDate = new Date("2024-01-01");
  const mockMessages: UnifiedMessage[] = [
    {
      id: "1",
      type: "human",
      data: {
        message: "first message",
      },
      createdAt: new Date(mockDate.getTime() + 1000),
      pending: false,
    },
    {
      id: "2",
      type: "agent",
      data: {
        message: "first response",
        done: false,
      },
      createdAt: new Date(mockDate.getTime() + 2000),
      pending: false,
    },
    {
      id: "3",
      type: "human",
      data: {
        message: "second message",
      },
      createdAt: new Date(mockDate.getTime() + 3000),
      pending: false,
    },
  ];

  it("should sort messages in ascending order", () => {
    const { result } = renderHook(() => useMessages(mockMessages));
    const sortedMessages = result.current.all("asc");

    expect(sortedMessages?.[0]?.id).toBe("1");
    expect(sortedMessages?.[1]?.id).toBe("2");
    expect(sortedMessages?.[2]?.id).toBe("3");
  });

  it("should sort messages in descending order", () => {
    const { result } = renderHook(() => useMessages(mockMessages));
    const sortedMessages = result.current.all("desc");

    expect(sortedMessages?.[0]?.id).toBe("3");
    expect(sortedMessages?.[1]?.id).toBe("2");
    expect(sortedMessages?.[2]?.id).toBe("1");
  });

  it("should filter messages by type", () => {
    const { result } = renderHook(() => useMessages(mockMessages));
    const humanMessages = result.current.getOfType("human");
    const agentMessages = result.current.getOfType("agent");

    expect(humanMessages).toHaveLength(2);
    expect(humanMessages?.every(msg => msg.type === "human")).toBe(true);

    expect(agentMessages).toHaveLength(1);
    expect(agentMessages?.every(msg => msg.type === "agent")).toBe(true);
  });

  it("should handle empty messages array", () => {
    const { result } = renderHook(() => useMessages([]));

    expect(result.current.all("asc")).toHaveLength(0);
    expect(result.current.all("desc")).toHaveLength(0);
    expect(result.current.getOfType("human")).toHaveLength(0);
    expect(result.current.getOfType("agent")).toHaveLength(0);
  });

  it("should get last message", () => {
    const { result } = renderHook(() => useMessages(mockMessages));
    const sortedMessages = result.current.all("desc");
    const lastMessage = sortedMessages?.[0];

    expect(lastMessage).toBeDefined();
    expect(lastMessage?.id).toBe("3");
  });

  it("should get last message by type", () => {
    const { result } = renderHook(() => useMessages(mockMessages));
    const humanMessages = result.current.getOfType("human");
    const agentMessages = result.current.getOfType("agent");

    // Since getOfType doesn't sort, we need to sort the filtered messages ourselves
    const sortedHumanMessages = humanMessages?.sort((a, b) => b.id.localeCompare(a.id));
    const sortedAgentMessages = agentMessages?.sort((a, b) => b.id.localeCompare(a.id));

    const lastHuman = sortedHumanMessages?.[0];
    expect(lastHuman?.id).toBe("3");
    expect(lastHuman?.type).toBe("human");

    const lastAgent = sortedAgentMessages?.[0];
    expect(lastAgent?.id).toBe("2");
    expect(lastAgent?.type).toBe("agent");
  });
});
