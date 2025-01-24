import React, { useState } from 'react';
import { Box, Text, useFocus } from 'ink';
import TextInput from 'ink-text-input';

interface InputProps {
  mask?: boolean;
  children?: React.ReactNode;
  onSetValue: (key: string) => void;
  autoFocus?: boolean;
  id: string;
  disabled?: boolean;
}

export const Input = ({ onSetValue, mask, children, id, disabled, autoFocus }: InputProps) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isFocused } = useFocus({ id, autoFocus });

  return (
    <Box flexDirection="column">
      {children}
      <Box borderStyle={isFocused ? 'round' : undefined} borderColor={isFocused ? 'cyan' : 'gray'}>
        <TextInput
          mask={mask ? '*' : undefined}
          value={inputValue}
          onChange={setInputValue}
          focus={isFocused}
          showCursor={false}
          onSubmit={value => {
            if (!value.trim()) {
              setError('Value cannot be empty');
              return;
            }
            try {
              onSetValue(value.trim());
              setError(null);
            } catch (err) {
              setError('Invalid format');
            }
          }}
        />
      </Box>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
};
