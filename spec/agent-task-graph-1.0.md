# Agent Task Graph Specification

Version 1.0.0

## Abstract
This specification defines a declarative format for describing workflows of AI agents. The workflow system allows for sequential and parallel execution, conditional branching, and iteration patterns. Each step in a workflow is executed by an AI agent with defined parameters and capabilities.

## Status of this Document
This document is a draft specification.

## Introduction
The Agent Workflow Specification defines a YAML-based format for orchestrating multiple AI agents in a coordinated workflow. It enables building complex automation flows while maintaining readability and ease of modification.

## Conventions
The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## Schema Definition

### Workflow Object
The top-level container for a series of steps.

```yaml
version: "1.0"     # REQUIRED. Must be "1.0"
workflow:          # REQUIRED
  steps:           # REQUIRED. Array of Step objects
```

### Step Object
Defines a single unit of work in the workflow.

Required Fields:
- `type`: Must be "run"
- `id`: String identifier for the step
- `agent`: Agent configuration object

Optional Fields:
- `depends_on`: Array of step identifiers that must complete before this step begins
- `if`: Expression string determining whether this step should execute
- `for_each`: Expression string referencing an array to iterate over

### Agent Object
Configures the AI agent that will execute a step.

Required Fields:
- `systemPrompt`: String containing instructions for the agent.
- `input`: String containing input data.
- `resultSchema`: JSON Schema object defining expected output format. Must conform to [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12).

Optional Fields:
- `attachedFunctions`: Array of Function objects defining available API calls. Empty array means all functions are allowed.
- `tags`: Object containing key-value metadata. Does not influence execution.
- `context`: Object containing additional context data. Will be received by each function call that agent makes.

### Function Object
Defines an API function available to the agent.

Required Fields:
- `service`: String identifier for the service providing the function
- `function`: String identifier for the specific function

### Step Output Object
Each step execution produces a standardized output object.

```yaml
type: object
properties:
  status:
    type: string
    enum: [success]
  result:
    type: object
    description: The output data
```

## Expression Syntax
Expressions are denoted by `${{ }}` and can reference:
- Step outputs: `steps.<step-id>.outputs`
- Current iteration item: `item`
- Workflow inputs: `inputs.<name>`

## Execution Semantics

### Step Execution
1. A step MUST NOT begin execution until all steps in its `depends_on` array have completed successfully
2. If a step's `if` condition evaluates to false, the step is skipped
3. If a step has a `for_each` field, it executes once for each item in the referenced array

### Step Resolution
1. A step is considered successful only when:
   - `status` is "success"
   - `result` conforms to the `resultSchema` if specified

### Expression Evaluation
1. Expressions MUST be evaluated before step execution
2. References to step outputs MUST refer to completed steps
3. The `item` context is only available in steps with `for_each`

## Examples

### Basic Sequential Flow
```yaml
workflow:
  steps:
    - type: run
      id: fetch_customer
      agent:
        systemPrompt: "Fetch customer record based on ticket text. Prefer new customer records over legacy users."
        input:
          ticket_text: ${{ inputs.ticket_text }}
        attachedFunctions:
          - service: customer
            function: getCustomer
          - service: legacyUsers
            function: getCustomer
        resultSchema:
          type: object
          properties:
            found:
              type: boolean
            customer:
              type: object
              properties:
                name: { type: string }
                email: { type: string }
                phone: { type: string }

    - type: run
      id: enrich_ticket
      depends_on: [fetch_customer]
      agent:
        systemPrompt: "Enrich the ticket with customer data"
        input:
          ticket: ${{ steps.fetch_customer.outputs.result.customer }}
```

### Parallel Execution with Error Handling
```yaml
workflow:
  steps:
    - type: run
      id: get_customer_date
      agent:
        systemPrompt: "Fetch customer record based on ticket text. Prefer new customer records over legacy users."
        input:
          ticket_text: ${{ inputs.ticket_text }}
        attachedFunctions:
          - service: customer
            function: getCustomer
          - service: legacyUsers
            function: getCustomer
        resultSchema:
          type: object
          properties:
            found:
              type: boolean
            customer:
              type: object
              properties:
                name: { type: string }
                email: { type: string }
                phone: { type: string }

    - type: run
      id: get_company_data
      agent:
        systemPrompt: "Fetch company data based on the ticket text"
        input:
          ticket_text: ${{ inputs.ticket_text }}
        attachedFunctions:
          - service: company
            function: getCompany
        resultSchema:
          type: object
          properties:
            found:
              type: boolean
            company:
              type: object
              properties:
                name: { type: string }
                tier: { type: string }

    - type: run
      id: enrich_ticket
      depends_on: [get_customer_data, get_company_data]
      agent:
        systemPrompt: "Enrich the ticket with customer and company data"
        input:
          customer: ${{ steps.get_customer_data.outputs.result.customer }}
          company: ${{ steps.get_company_data.outputs.result.company }}
```

### Conditional Processing
```yaml
workflow:
  steps:
    - type: run
      id: evaluate
      agent:
        systemPrompt: |
          Evaluate urgency of the ticket.
          If the customer is a premium customer, set urgency to "high".
          If the inquiry is about an issued quote, set urgency to "high".
          If the inquiry is about a billing issue, set urgency to "high".
          Otherwise, set urgency to "low".
        attachedFunctions:
          - service: customer
            function: getCustomer
          - service: quote
            function: getIssuedQuoteByEmail
        resultSchema:
          type: object
          properties:
            urgency:
              type: string
              enum: [low, high]

    - type: run
      id: escalate_ticket
      depends_on: [evaluate]
      if: ${{ steps.evaluate.outputs.result.urgency === "high" }}
      agent:
        systemPrompt: "Copy the account manager if the ticket urgency is high"
        input:
          ticket: ${{ inputs.ticket }}
        attachedFunctions:
          - service: staff
            function: getAccountManagerForCustomer
          - service: ticket
            function: attachStaffToTicket
        resultSchema:
          type: object
          properties:
            done:
              type: boolean
```

### Iteration

```yaml
workflow:
  steps:
    - type: run
      id: get_records
      agent:
        systemPrompt: "Get list of records"
        resultSchema:
          type: object
          properties:
            records:
              type: array
              items:
                type: object
                properties:
                  id: { type: string }
                  name: { type: string }

    - type: run
      id: process_record
      depends_on: [get_records]
      for_each: ${{ steps.get_records.outputs.result.records }}
      agent:
        systemPrompt: "Process single record"
        input:
          record: ${{ item.id }}
```

## Failure modes

1. If a step fails, all dependent steps MUST NOT execute
2. A workflow MUST fail if any required step fails
3. If a step in a `for_each` loop fails, the remaining iterations MUST still execute, but the step MUST be marked as failed

## Version History

- 1.0.0: Initial release
