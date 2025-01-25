import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import { createClient } from '../lib/client.js';

interface AgentSelectorProps {
  apiKey: string;
  clusterId: string;
  onSelectAgent: (agentId: string | null) => void;
}

export const NONE_AGENT_ID = 'none';

export const AgentSelector = ({ apiKey, clusterId, onSelectAgent }: AgentSelectorProps) => {
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createClient(apiKey);
    setLoading(true);
    client.listAgents({ params: { clusterId } }).then(response => {
      if (response.status === 200) {
        setLoading(false);
        setAgents([{ id: NONE_AGENT_ID, name: 'None' }, ...response.body]);
      }
    });
  }, [apiKey, clusterId]);

  useInput((_, key) => {
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(prev + 1, agents.length - 1));
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (key.return) {
      onSelectAgent(agents[selectedIndex].id);
    } else if (key.escape) {
      onSelectAgent(null);
    }
  });

  if (loading) {
    return <Text>Loading agents...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="green">Select an agent:</Text>
      {agents.map((agent, index) => (
        <Text key={agent.id} color={index === selectedIndex ? 'cyan' : 'white'}>
          {index === selectedIndex ? '> ' : '  '}{agent.name}
        </Text>
      ))}
      <Text dimColor>
        Use arrow keys to navigate, Enter to select, Esc to exit
      </Text>
    </Box>
  );
};
