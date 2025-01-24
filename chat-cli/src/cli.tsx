import { render } from 'ink';
import { App } from './app.js';

export const runCLI = (props: { clusterId?: string; apiSecret?: string; agentId?: string; runId?: string }) => {
  render(<App {...props} />);
};
