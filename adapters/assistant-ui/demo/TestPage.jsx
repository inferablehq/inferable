import { useInferableRuntime } from '../src'
import { AssistantRuntimeProvider, Thread } from "@assistant-ui/react";

const FallbackToolUI = ({args, result, toolName}) =>
  <div className="center">
    <h1>Tool: {toolName}</h1>
    <h2>Input:</h2>
    <pre className="whitespace-pre-wrap">{JSON.stringify(args, null, 2)}</pre>
    <h2>Output:</h2>
    {result && <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>}
    {!result && <p>No output</p>}
  </div>

const TestPage = () => {
  const existingRunId = localStorage.getItem("runID")

  const { runtime, run } = useInferableRuntime({
    clusterId: import.meta.env.VITE_INFERABLE_CLUSTER_ID,
    apiSecret: import.meta.env.VITE_INFERABLE_API_SECRET,
    runId: existingRunId,
    onError: (error) => {
      toast.error(error.message)
    }
  })

  if (run && existingRunId !== run.id) {
    localStorage.setItem("runID", run.id);
  }

  if (existingRunId && !run) {
    return <div className="center">Loading...</div>;
  }

  return (
    <div className="h-full">
      <AssistantRuntimeProvider runtime={runtime}>
        <Thread assistantMessage={{
          components: {
            ToolFallback: FallbackToolUI
          },
        }} />
      </AssistantRuntimeProvider>
    </div>
  );
};

export default TestPage
