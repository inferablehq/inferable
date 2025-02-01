# Workflow System Design

The workflow system provides a powerful "Workflow as Code" approach to orchestrating complex, multi-step AI agent interactions within the Inferable platform. By isolating all side effects within agents, you get the best of both worlds: the full power and flexibility of TypeScript/JavaScript for orchestration, with the safety and manageability of isolated, tracked agent executions.

## Core Concepts

### Workflow as Code

The workflow system lets you write pure TypeScript/JavaScript code for orchestration while isolating all side effects within agents. This means you can:

- Use all standard programming patterns (control flow, error handling, etc.)
- Write type-safe, testable workflow logic
- Run operations in parallel or sequence using standard async/await
- Maintain clean, readable orchestration code
- Keep all side effects isolated and manageable

The Inferable control plane handles all the complexity of workflow execution. When you run a workflow:

1. The workflow code executes until it encounters an agent
2. The agent execution is dispatched to the control plane
3. The control plane waits for the agent to complete
4. Once complete, the control plane re-runs the workflow from the start
5. Previous agent results are cached, so they aren't re-executed
6. This continues until the workflow completes or errors

This execution model means your workflow code is truly pure - it's re-run from scratch each time, with the control plane managing all state and side effects through agents.

Example of mixing parallel and sequential operations:

```typescript
// Sequential execution
const records = await recordsAgent.run();

// Parallel execution
const processedRecords = await Promise.all(
  records.result.records.map((record) => {
    const agent2 = ctx.agent({...});
    return agent2.run();
  })
);

// Back to sequential
const riskProfile = await ctx.agent({...}).run();
```

### Agents and Side Effect Isolation

Agents are the building blocks where all side effects (API calls, database operations, etc.) are isolated. Each agent:

- Has a unique name
- Receives a system prompt
- Has strictly typed inputs and outputs (validated using Zod schemas)
- Maintains independent execution tracking
- Can be retried independently if it fails

This isolation means your workflow orchestration code remains pure and testable, while side effects are properly managed and tracked.

### Managing Side Effects

We strongly recommend against mixing unmanaged side effects (like direct API calls, database operations, etc.) within workflow runs. Instead, isolate all side effects within agents. Here's why:

1. **Reliability Risk**: Unmanaged side effects that fail can jeopardize the entire workflow execution, as the control plane doesn't track or manage their state.

2. **Multiple Executions**: Remember that the control plane re-runs your workflow code from the start after each agent completion. This means any unmanaged side effects in your workflow code may be executed multiple times.

If you absolutely must introduce side effects outside of agents (like function calls, database operations, or network requests), follow these guidelines:

1. **Prefer Agent Isolation** (Recommended)

   - Whenever possible, wrap your side effects in an agent
   - This gives you proper tracking, error handling, and state management

2. **Error-Proof Implementation**

   - If you must have direct side effects, ensure they can never fail
   - Catch and handle all possible errors appropriately
   - Never let unhandled errors bubble up to the workflow

3. **Idempotency**
   - Make all side effects safe to call multiple times
   - Use `ctx.executionId` as part of your idempotency key
   - Example:
   ```typescript
   // Good: Idempotent side effect using executionId
   await db
     .insertRecord({
       id: `${ctx.executionId}-myOperation`,
       data: myData,
       // This will only insert once per workflow execution
     })
     .onConflictDoNothing();
   ```

> Note: We will soon introduce `ctx.effect(() => {})` to help manage unmanaged side effects more safely.

## Implementation Details

### Workflow Configuration

```typescript
type WorkflowConfig<TInput extends WorkflowInput, name extends string> = {
  inferable: Inferable;
  name: name;
  inputSchema: z.ZodType<TInput>;
};
```

### Agent Configuration

```typescript
type AgentConfig<TInput, TResult> = {
  name: string;
  systemPrompt: string;
  resultSchema?: z.ZodType<TResult>;
  input?: TInput;
  runId?: string;
};
```

## Key Features

1. **Type Safety and Validation**

   - End-to-end type safety with TypeScript
   - Input/output schemas defined using Zod
   - Runtime validation of all inputs and outputs
   - Type inference throughout the workflow

2. **Versioning and Evolution**

   - Multiple versions can run simultaneously
   - Gradual migration between versions
   - Safe testing of new versions
   - Easy rollback if issues are discovered

3. **Error Handling and Recovery**

   - `WorkflowPausableError` for temporary pauses
   - `WorkflowTerminableError` for permanent failures
   - Independent tracking of each agent execution
   - Ability to debug and resume failed workflows

4. **Execution Context**
   - Each workflow execution maintains its context
   - Context includes input data and agent factory
   - Supports both sequential and parallel agent execution
   - Control plane manages execution state and agent results
   - Workflows are re-run from start after each agent completion

## Usage Example

```typescript
const workflow = inferable.workflows.create({
  name: "records-workflow",
  inputSchema: z.object({
    executionId: z.string(),
    customerId: z.string(),
  }),
});

workflow.version(1).define(async (ctx, input) => {
  const agent = ctx.agent({
    name: "recordsAgent",
    systemPrompt: "Get list of loans for a customer",
    resultSchema: z.object({
      records: z.array(z.object({ id: z.string() })),
    }),
    input: {
      customerId: input.customerId,
    },
  });

  const result = await agent.run();
  // Process result...
});

await workflow.listen();
```

## Benefits

The combination of Workflow as Code and side effect isolation provides several key benefits:

1. **Maintainability**

   - Clear separation between orchestration and side effects
   - Pure, testable workflow logic
   - Type-safe code with excellent IDE support
   - Workflows are always re-run from a clean state

2. **Reliability**

   - Side effects are isolated and tracked
   - Strong error handling and recovery
   - Version control for safe evolution
   - Control plane manages all execution state

3. **Flexibility**

   - Full power of TypeScript/JavaScript for orchestration
   - Mix parallel and sequential operations
   - Complex control flow when needed
   - No need to manage agent state or results

4. **Safety**
   - Type checking at compile time
   - Schema validation at runtime
   - Isolated side effects
   - Tracked execution state
   - Pure workflow code that's re-run from scratch

## Lifecycle Management

1. **Starting Workflows**

   - Call `workflow.listen()` to start accepting executions
   - Each version runs in its own service
   - Control plane manages workflow execution and state

2. **Stopping Workflows**

   - Use `workflow.unlisten()` to gracefully stop
   - Ensures proper cleanup of resources
   - Control plane handles graceful shutdown

3. **Execution Tracking**
   - Each execution has a unique ID
   - Status changes are tracked
   - Results are properly propagated
   - Control plane maintains execution history
   - Agent results are cached for workflow re-runs
