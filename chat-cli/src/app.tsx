import { useState } from 'react';
import { render, Text, Box } from 'ink';
import { AgentSelector, NONE_AGENT_ID } from './components/AgentSelector.js';
import { Input } from './components/Input.js';
import { ChatInterface } from './chat.js';
import { RunSelector, NONE_RUN_ID } from './components/RunSelector.js';

const App = () => {

  const [apiSecret, setApiSecret] = useState<string | null>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  if (!apiSecret) {
    if (process.env.INFERABLE_API_SECRET) {
      setApiSecret(process.env.INFERABLE_API_SECRET);
    }

    return <Input
      children={<Text>Enter your API secret:</Text>}
      onSetValue={(key) => {
        setApiSecret(key);
      }} />;
  }

  if (!clusterId) {
    if (process.env.INFERABLE_CLUSTER_ID) {
      setClusterId(process.env.INFERABLE_CLUSTER_ID);
    }

    return <Input
      children={<Text>Enter your cluster ID:</Text>}
      onSetValue={(key) => {
        setClusterId(key);
      }} />;
  }

  if (!selectedRun) {
    return (
      <RunSelector
        apiKey={apiSecret}
        clusterId={clusterId}
        onSelectRun={setSelectedRun}
      />
    );
  }


  if (selectedRun === NONE_RUN_ID && !selectedAgent) {
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
    runId={selectedRun === NONE_RUN_ID ? undefined : selectedRun}
    agentId={selectedAgent === NONE_AGENT_ID ? undefined : selectedAgent ?? undefined}
  />
};

render(<App />);
