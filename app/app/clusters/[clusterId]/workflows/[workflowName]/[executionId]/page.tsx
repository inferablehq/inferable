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
    <div className="p-4">
      <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
        <h1 className="text-2xl font-semibold mb-4">
          Workflow Execution Details
        </h1>
        <div className="text-center text-gray-600">
          <p className="text-lg mb-4">
            Workflow: {params.workflowName}
          </p>
          <p className="text-md mb-4">
            Execution ID: {params.executionId}
          </p>
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
    </div>
  );
}
