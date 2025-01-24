import React, { useEffect, useState } from 'react';
import { render, Text, Box, useInput, useApp, Newline, useFocus } from 'ink';
import TextInput from 'ink-text-input';
import { Collapsible } from './components/Collapsible.js';

import { useInferable, useRun, useMessages } from '@inferable/react';
import Spinner from 'ink-spinner';

type ChatProps = {
  apiSecret: string;
  clusterId: string;
  runId?: string;
  agentId?: string;
};

export const ChatInterface = ({ apiSecret, clusterId, runId, agentId }: ChatProps) => {
  const [input, setInput] = useState('');

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
                <Collapsible
                    key={index}
                    id={`invocation-${index}`}
                    title={`Calling ${invocation.toolName}()`}
                    defaultCollapsed={true}
                  >
                    {invocation.reasoning && (
                      <Text>Reason: {invocation.reasoning}</Text>
                    )}
                    {Object.keys(invocation.input).map((key) => (
                      <Box flexDirection="column" key={key}>
                        <Text bold>{key}:</Text>
                        <Text>{JSON.stringify(invocation.input[key], null, 2)}</Text>
                      </Box>
                    ))}
                  </Collapsible>
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
            <Collapsible
              key={msg.id}
              id={`result-${msg.id}`}
              title={"Result"}
              defaultCollapsed={true}
            >
              <Text>{JSON.stringify(nestedResult, null, 2)}</Text>
            </Collapsible>
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
          agentId,
        });
        setRunId(id);
      } else {
        await createMessage(input.trim());
      }
    }

    setInput('');
  };

  const { isFocused: inputFocused } = useFocus({
    id: 'chat-input',
    autoFocus: true
  });

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" marginBottom={1}>
        {messages?.all('asc')?.map((msg, index) => (
          <Box
            key={msg.id}
            flexDirection="column"
            paddingBottom={1}
          >
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
      ) : (            <Box flexDirection="row" alignItems="center">
              <Text dimColor={!inputFocused} color={inputFocused ? 'yellow' : 'gray'}>Input: </Text>
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                showCursor
                focus={inputFocused}
              />
            </Box>
        )}

      <Box marginTop={1}>
        <Text dimColor>Ctrl+C to exit | {inputFocused ? "Enter to send message" : "Enter to toggle function"} | tab to navigate messages</Text>
      </Box>
    </Box>
  );
};
