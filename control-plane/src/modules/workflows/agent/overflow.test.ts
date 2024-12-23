import { AgentError } from '../../../utilities/errors';
import { WorkflowAgentStateMessage } from './state';
import { handleContextWindowOverflow } from './overflow';
import { estimateTokenCount } from './utils';

jest.mock('./utils', () => ({
  estimateTokenCount: jest.fn(),
}));

describe('handleContextWindowOverflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw if system prompt exceeds threshold', async () => {
    const systemPrompt = 'System prompt';
    const messages: WorkflowAgentStateMessage[] = [];
    const modelContextWindow = 1000;

    (estimateTokenCount as jest.Mock)
      .mockResolvedValueOnce(701); // system prompt (0.7 * 1000)

    await expect(
      handleContextWindowOverflow({
        systemPrompt,
        messages,
        modelContextWindow,
      })
    ).rejects.toThrow(new AgentError('System prompt can not exceed 700 tokens'));
  });

  it('should not modify messages if total tokens are under threshold', async () => {
    const systemPrompt = 'System prompt';
    const messages: WorkflowAgentStateMessage[] = [
      { type: 'human', data: { message: 'Hello' } } as any,
      { type: 'agent', data: { message: 'Hi' } } as any,
    ];
    const modelContextWindow = 1000;

    (estimateTokenCount as jest.Mock)
      .mockResolvedValueOnce(100) // system prompt
      .mockResolvedValueOnce(200); // messages

    const result = await handleContextWindowOverflow({
      systemPrompt,
      messages,
      modelContextWindow,
    });

    expect(result).toEqual(messages);
    expect(messages).toHaveLength(2);
  });

  it('should handle empty messages array', async () => {
    const systemPrompt = 'System prompt';
    const messages: WorkflowAgentStateMessage[] = [];
    const modelContextWindow = 1000;

    (estimateTokenCount as jest.Mock)
      .mockResolvedValueOnce(200) // system prompt
      .mockResolvedValueOnce(0); // empty messages

    const result = await handleContextWindowOverflow({
      systemPrompt,
      messages,
      modelContextWindow,
    });

    expect(result).toEqual(messages);
    expect(messages).toHaveLength(0);
  });

  describe('truncate strategy', () => {
    it('should remove messages until total tokens are under threshold', async () => {
      const systemPrompt = 'System prompt';
      const messages: WorkflowAgentStateMessage[] = Array(5).fill({
        type: 'human',
        data: { message: 'Message' },
      });
      const modelContextWindow = 600;

      (estimateTokenCount as jest.Mock)
        .mockResolvedValueOnce(200) // system prompt
        .mockResolvedValueOnce(900) // initial messages
        .mockResolvedValueOnce(700) // after first removal
        .mockResolvedValueOnce(500) // after second removal
        .mockResolvedValueOnce(300); // after third removal

      const result = await handleContextWindowOverflow({
        systemPrompt,
        messages,
        modelContextWindow,
      });

      expect(result).toHaveLength(2);
    });

    it('should throw if a single message exceeds the context window', async () => {
      const systemPrompt = 'System prompt';
      const messages: WorkflowAgentStateMessage[] = [
        { type: 'human', data: { message: 'Message' } } as any,
      ];
      const modelContextWindow = 400;

      (estimateTokenCount as jest.Mock)
        .mockResolvedValueOnce(200) // system prompt
        .mockResolvedValueOnce(400); // message

      await expect(
        handleContextWindowOverflow({
          systemPrompt,
          messages,
          modelContextWindow,
        })
      ).rejects.toThrow(AgentError);
    });


    it('should remove tool invocation result when removing agent message', async () => {
      const systemPrompt = 'System prompt';
      const messages: WorkflowAgentStateMessage[] = [
        { id: "123", type: 'agent', data: { message: 'Hi', invocations: [
          {
            id: "toolCallId1",
          },
          {
            id: "toolCallId2",
          },
          {
            id: "toolCallId3",
          },
        ]}} as any,
        { id: "456", type: 'invocation-result', data: { id: "toolCallId1" } } as any,
        { id: "456", type: 'invocation-result', data: { id: "toolCallId2" } } as any,
        { id: "456", type: 'invocation-result', data: { id: "toolCallId3" } } as any,
        { id: "789", type: 'human', data: { message: 'Hello' }} as any,
      ];

      // Only one message needs to be removed to satisfy context window
      // 2 will be removed to ensure first message is human
      const modelContextWindow = 1100;
      (estimateTokenCount as jest.Mock)
        .mockResolvedValueOnce(200) // system prompt
        .mockResolvedValueOnce(1000) // initial messages
        .mockResolvedValueOnce(800) // after first removal

      const result = await handleContextWindowOverflow({
        systemPrompt,
        messages,
        modelContextWindow,
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('human');
    });

    it('should remove agent message when removing tool invocation result', async () => {
      const systemPrompt = 'System prompt';
      const messages: WorkflowAgentStateMessage[] = [
        { id: "456", type: 'invocation-result', data: { id: "toolCallId1" } } as any,
        { id: "123", type: 'agent', data: { message: 'Hi', invocations: [
          {
            id: "toolCallId1",
          },
        ]}} as any,
        { id: "789", type: 'human', data: { message: 'Hello' }} as any,
      ];

      // Only one message needs to be removed to satisfy context window
      // 2 will be removed to ensure first message is human
      const modelContextWindow = 1100;
      (estimateTokenCount as jest.Mock)
        .mockResolvedValueOnce(200) // system prompt
        .mockResolvedValueOnce(1000) // initial messages
        .mockResolvedValueOnce(800) // after first removal
        .mockResolvedValueOnce(600) // after second removal

      const result = await handleContextWindowOverflow({
        systemPrompt,
        messages,
        modelContextWindow,
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('human');
    })

    it('should ensure first message is human', async () => {
      const systemPrompt = 'System prompt';
      const messages: WorkflowAgentStateMessage[] = [
        { id: "789", type: 'human', data: { message: 'Hello' }} as any,
        { id: "123", type: 'agent', data: { message: 'Hi', invocations: [
          {
            id: "toolCallId1",
          },
        ]}} as any,
        { id: "789", type: 'human', data: { message: 'Hello' }} as any,
      ];

      // Only one message needs to be removed to satisfy context window
      // 2 will be removed to ensure first message is human
      const modelContextWindow = 1100;
      (estimateTokenCount as jest.Mock)
        .mockResolvedValueOnce(200) // system prompt
        .mockResolvedValueOnce(1000) // initial messages
        .mockResolvedValueOnce(800) // after first removal
        .mockResolvedValueOnce(600) // after second removal

      const result = await handleContextWindowOverflow({
        systemPrompt,
        messages,
        modelContextWindow,
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('human');
    })
  })
});
