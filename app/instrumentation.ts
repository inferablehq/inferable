export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && !!process.env.HYPERDX_API_KEY) {
    const { init } = await import('@hyperdx/node-opentelemetry');
    init({
      disableLogs: true,
      disableStartupLogs: true,
      apiKey: process.env.HYPERDX_API_KEY,
      service: 'app',
      additionalInstrumentations: [],
    });
  }
}
