import React, { useEffect, useState } from 'react';
import { render, Text, Box, useInput, useApp, Newline } from 'ink';
import TextInput from 'ink-text-input';

import { useInferable, useRun, useMessages } from '@inferable/react';
import Spinner from 'ink-spinner';

type Message = {
  content: string;
  role: 'user' | 'assistant';
};

type ChatProps = {
  apiSecret: string;
  clusterId: string;
  runId?: string;
  agentId?: string;
};

export const ChatInterface = ({ apiSecret, clusterId, runId, agentId }: ChatProps) => {
  const [input, setInput] = useState('');
  const { exit } = useApp();

  useInput((_, key) => {
    if (key.escape) exit();
  });

  const inferable = useInferable({
    clusterId,
    apiSecret,
    authType: "cluster",
  });


  const {
    createMessage,
    messages: rawMessages,
    setRunId,
    run,
  } = useRun(inferable);

  const buildMsgBody = (msg: typeof rawMessages[number]) => {
    switch (msg.type) {
      case 'human': {
        return <Text>{msg.data.message}</Text>;
      }
      case 'agent': {
        if (msg.data.invocations) {
          return (
            <Box flexDirection="column">
              <Text>{msg.data.message}</Text>
              {msg.data.invocations.map((invocation, index) => (
                <Box
                  key={index}
                  flexDirection="column"
                  paddingTop={1}
                >
                  <Text bold>Calling {invocation.toolName}():</Text>
                  {invocation.reasoning && (
                    <Text>Reason: {invocation.reasoning}</Text>
                  )}
                  {Object.keys(invocation.input).map((key) => (
                    <Box flexDirection="column" key={key}>
                      <Text bold>{key}:</Text>
                      <Text>{JSON.stringify(invocation.input[key], null, 2)}</Text>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          );
        }
        return <Text>{msg.data.message}</Text>;
      }
      case 'invocation-result': {
        const prop = Object.keys(msg.data.result)[0];
        const nestedResult = (msg.data.result[prop] as any).result;

        return (
          <Box flexDirection="column">
            <Text bold>Result:</Text>
            <Text>{JSON.stringify(nestedResult, null, 2)}</Text>
          </Box>
        );
      }
      case 'template':
      case 'supervisor':
      default: {
        return <div />;
      }
    }
  };

  const buildMsgHeader = (msg: typeof rawMessages[number]) => {
    switch (msg.type) {
      case 'human': {
        return (<Text color="blue">You:</Text>);
      }
      case 'agent': {
        return (<Text color="green">Agent:</Text>);
      }
    }
  }

  useEffect(() => {
    if (runId) {
      setRunId(runId);
    }
  }, [runId]);

  // Get utility functions for working with messages
  const messages = useMessages(rawMessages);

  const handleSubmit = async () => {
    if (input.trim()) {
      if (!run?.id) {
        const { id } = await inferable.createRun({
          initialPrompt: input.trim(),
          interactive: true,
        });
        setRunId(id);
      } else {
        await createMessage(input.trim());
      }
    }

    setInput('');
  };

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" marginBottom={1}>
        {messages?.all('asc')?.map((msg) => (
          <Box key={msg.id} flexDirection="column" paddingBottom={1}>
            <Box flexDirection="row">
              {buildMsgHeader(msg)}
            </Box>
            {buildMsgBody(msg)}
          </Box>
        ))}
      </Box>

      {messages?.all('asc')?.at(-1)?.type === 'human' ? (
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Loading'}
        </Text>
      ) : (
          <Box flexDirection="row" alignItems="center">
            <Text color="yellow">Input: </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              showCursor
            />
          </Box>
        )}

      <Box marginTop={1}>
        <Text dimColor>Ctrl + C to exit | Enter to send message</Text>
      </Box>
    </Box>
  );
};
