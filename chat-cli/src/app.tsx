import { useState, useEffect } from 'react';
import { render, Text, Box } from 'ink';
import { AgentSelector, NONE_AGENT_ID } from './components/AgentSelector.js';
import { Input } from './components/Input.js';
import { ChatInterface } from './chat.js';
import { RunSelector, NONE_RUN_ID } from './components/RunSelector.js';

type AppProps = {
  clusterId?: string;
  apiSecret?: string;
  agentId?: string;
  runId?: string;
};

export const App = ({
  clusterId: initialClusterId,
  apiSecret: initialApiSecret,
  agentId: initialAgentId,
  runId: initialRunId
}: AppProps = {}) => {

  const [apiSecret, setApiSecret] = useState<string | null>(initialApiSecret ?? null);
  const [clusterId, setClusterId] = useState<string | null>(initialClusterId ?? null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(initialAgentId ?? null);
  const [selectedRun, setSelectedRun] = useState<string | null>(initialRunId ?? null);

  if (!apiSecret) {
    return <Input
        id="api-secret-input"
        key="api-secret-input"
        autoFocus={true}
        mask={true}
        children={<Text>Enter your API secret:</Text>}
        onSetValue={(key) => {
          setApiSecret(key);
        }} />;
  }

  if (!clusterId) {
    return <Input
      id="cluster-id-input"
      key="cluster-id-input"
      autoFocus={true}
      children={<Text>Enter your cluster ID:</Text>}
      onSetValue={(key) => {
        setClusterId(key);
      }} />;
  }

  if (!selectedAgent && !selectedRun && selectedRun !== NONE_RUN_ID) {
    return (
      <RunSelector
        apiKey={apiSecret}
        clusterId={clusterId}
        onSelectRun={setSelectedRun}
      />
    );
  }


  if (selectedRun === NONE_RUN_ID && !selectedAgent && selectedAgent !== NONE_AGENT_ID) {
    return (
      <AgentSelector
        apiKey={apiSecret}
        clusterId={clusterId}
        onSelectAgent={setSelectedAgent}
      />
    );
  }

  return <ChatInterface
    apiSecret={apiSecret}
    clusterId={clusterId}
    runId={selectedRun === NONE_RUN_ID ? undefined : selectedRun ?? undefined}
    agentId={selectedAgent === NONE_AGENT_ID ? undefined : selectedAgent ?? undefined}
  />
};
