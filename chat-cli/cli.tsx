  const [inputValue, setInputValue] = useState('');

  if (!apiKey) {
    return (
      <Box flexDirection="column">
        <Text color="green">Welcome to Inferable CLI</Text>
        <Text>Please enter your API key:</Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          mask="*"
          onSubmit={key => {
            try {
              createClient(key);
              setApiKey(key);
            } catch (err) {
              setError('Invalid API key format');
            }
          }}
        />
      </Box>
    );
  }
