import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputProps {
  mask?: boolean;
  children?: React.ReactNode;
  onSetValue: (key: string) => void;
}

export const Input = ({ onSetValue, mask, children }: InputProps) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Box flexDirection="column">
      {children}
      <TextInput
        mask={mask ? '*' : undefined}
        value={inputValue}
        onChange={setInputValue}
        onSubmit={value => {
          try {
            onSetValue(value);
          } catch (err) {
            setError('Invalid format');
          }
        }}
      />
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
};
