import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useFocus, useApp } from 'ink';

interface CollapsibleProps {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  id: string;
  disabled?: boolean;
}

export const Collapsible = ({ title, children, defaultCollapsed = true, id, disabled }: CollapsibleProps) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { isFocused } = useFocus({ 
    id, 
    autoFocus: false,
    isActive: !disabled 
  });
  const { exit } = useApp();

  // Collapse when focus is lost
  useEffect(() => {
    if (!isFocused && !isCollapsed) {
      // Force terminal to scroll to bottom after collapse
      setTimeout(() => {
        process.stdout.write('\n');
        process.stdout.moveCursor(0, -1);
      }, 0);
    }
  }, [isFocused, isCollapsed]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
    // Force terminal to scroll to bottom after toggle
    setTimeout(() => {
      process.stdout.write('\n');
      process.stdout.moveCursor(0, -1);
    }, 0);
  }, []);

  useInput((input, key) => {
    if (isFocused) {
      if (key.return) {
        toggleCollapse();
      } else if (key.escape) {
        if (!isCollapsed) {
          // Collapse before exiting if expanded
          setIsCollapsed(true);
          process.stdout.write('\x1Bc'); // Clear screen
        }
        exit();
      }
    }
  }, { isActive: isFocused });

  if (isCollapsed) {
    return (
      <Text>
        <Text color="cyan">▸ </Text>
        <Text color={isFocused ? 'yellow' : 'white'}>{title}</Text>
      </Text>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      <Box justifyContent="space-between">
        <Text color="cyan" bold>{title}</Text>
        <Text color="cyan" dimColor>[Tab] to close</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
};
