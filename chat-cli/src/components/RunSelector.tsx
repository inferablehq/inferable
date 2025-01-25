import React, { useState, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';
import { createClient } from '../lib/client.js';

interface RunSelectorProps {
  apiKey: string;
  clusterId: string;
  onSelectRun: (runId: string | null) => void;
}

export const NONE_RUN_ID = 'none';

export const RunSelector = ({ apiKey, clusterId, onSelectRun }: RunSelectorProps) => {
  const [runs, setRuns] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createClient(apiKey);
    setLoading(true);
    client.listRuns({ params: { clusterId }, query: { limit: 50 } }).then(response => {
      if (response.status === 200) {
        setLoading(false);
        setRuns([{ id: NONE_RUN_ID, name: 'New Run' }, ...response.body]);
      }
    });
  }, [apiKey, clusterId]);

  useInput((_, key) => {
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(prev + 1, runs.length - 1));
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (key.return) {
      onSelectRun(runs[selectedIndex]?.id);
    } else if (key.escape) {
      onSelectRun(null);
    }
  });

  if (loading) {
    return <Text>Loading runs...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="green">Select a run:</Text>
      {runs.map((run, index) => (
        <Text key={run.id} color={index === selectedIndex ? 'cyan' : 'white'}>
          {index === selectedIndex ? '> ' : '  '}{run.name || `Run ${run.id.slice(0, 6)}`}
        </Text>
      ))}
      <Text dimColor>
        Use arrow keys to navigate, Enter to select, Esc to exit
      </Text>
    </Box>
  );
};
