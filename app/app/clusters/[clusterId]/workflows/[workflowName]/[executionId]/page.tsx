export default function WorkflowExecutionDetailsPage({
  params
}: {
    params: {
      clusterId: string,
      workflowName: string,
      executionId: string
    }
  }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl mb-2"><pre>{params.workflowName} - {params.executionId}</pre></h1>
      <div className="text-center text-gray-600 mt-4">
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md inline-block">
          <p className="text-yellow-700 font-medium">
            🚧 In Development
          </p>
          <p className="text-yellow-600 text-sm mt-2">
            Detailed workflow execution view coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
