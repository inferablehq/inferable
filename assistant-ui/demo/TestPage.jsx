import { useInferableRuntime } from '../src'
import { Thread } from "@assistant-ui/react";
import toast from "react-hot-toast";

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
      <Thread runtime={runtime}/>
    </div>
  );
};

export default TestPage
