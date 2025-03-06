package inferable

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/inferablehq/inferable/sdk-go/internal/client"
	"github.com/invopop/jsonschema"
)

// WorkflowInput is the base input type for all workflows.
// It contains the execution ID which uniquely identifies a workflow execution.
type WorkflowInput struct {
	ExecutionID string `json:"executionId"`
}

// Logger interface for workflow logging.
// Implementations of this interface can be used to log workflow events.
type Logger interface {
	// Info logs an informational message with associated metadata.
	Info(message string, meta map[string]interface{})
	// Error logs an error message with associated metadata.
	Error(message string, meta map[string]interface{})
}

// WorkflowConfig holds the configuration for a workflow.
// It defines the workflow's name, description, input schema, and logger.
type WorkflowConfig struct {
	// Name is the unique identifier for the workflow.
	Name string
	// Description provides a human-readable explanation of the workflow's purpose.
	Description string
	// InputSchema defines the expected structure of the workflow input.
	InputSchema interface{}
	// Logger is used for logging workflow events.
	Logger Logger
}

// WorkflowContext provides context for workflow execution.
// It contains all the necessary information and functionality for a workflow to execute.
type WorkflowContext struct {
	// Input for the workflow
	Input interface{}
	// Approved indicates if the workflow is approved
	Approved bool
	// LLM functionality for the workflow
	LLM *LLM
	// Memo caches results for the workflow. It provides a way to store and retrieve
	// computation results across workflow executions. The function takes a name to
	// identify the cached result and a function that computes the result if not cached.
	// If a result with the given name exists in the cache, it is returned without
	// executing the function. Otherwise, the function is executed and its result is
	// stored in the cache before being returned.
	Memo func(name string, fn func() (interface{}, error)) (interface{}, error)
	// Log logs information for the workflow. It records a status message and associated
	// metadata for the current workflow execution. This information can be used for
	// monitoring, debugging, and auditing workflow executions. The status parameter
	// indicates the current state or event being logged, and the meta parameter provides
	// additional context or data related to the status.
	Log func(status string, meta map[string]interface{}) error
	// Agents provides agent functionality for the workflow
	Agents *Agents
}

// LLM provides LLM (Large Language Model) functionality for workflows.
// It enables workflows to interact with language models for text generation and processing.
type LLM struct {
	client      *client.Client
	apiSecret   string
	clusterId   string
	executionId string
}

// StructuredInput represents input for structured LLM generation.
// It includes the input text and a schema defining the expected output structure.
type StructuredInput struct {
	// Input is the text prompt for the LLM.
	Input string `json:"input"`
	// Schema defines the expected structure of the LLM output.
	Schema interface{} `json:"schema"`
}

// Structured generates structured output from the LLM based on the provided input.
// It sends the input to the LLM and returns the structured response according to the schema.
//
//	result, err := ctx.LLM.Structured(StructuredInput{
//		Input: "Hello, how are you?",
//		Schema: struct {
//			Result string `json:"result"`
//		}{},
//	})
//
//	if err != nil {
//		// Handle error
//	}
//
//	return result, nil
func (l *LLM) Structured(input StructuredInput) (interface{}, error) {
	// Convert schema to JSON schema if needed
	if input.Schema != nil {
		reflector := jsonschema.Reflector{DoNotReference: true}
		schema := reflector.Reflect(input.Schema)

		// Remove the schema version that gives errors with ajv
		schema.Version = ""

		input.Schema = schema
	}

	payload, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal structured input: %v", err)
	}

	headers := map[string]string{
		"Authorization":           "Bearer " + l.apiSecret,
		"X-Workflow-Execution-Id": l.executionId,
		"Content-Type":            "application/json",
		"X-Provider-Model":        "claude-3-5-sonnet",
		"X-Provider-Url":          "",
		"X-Provider-Key":          "",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/l1m/structured", l.clusterId),
		Method:  "POST",
		Headers: headers,
		Body:    string(payload),
	}

	result, _, err, status := l.client.FetchData(options)
	if err != nil {
		return nil, fmt.Errorf("failed to call structured LLM: %v", err)
	}

	if status != 200 {
		return nil, fmt.Errorf("failed to call structured LLM, status: %d", status)
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(result), &response); err != nil {
		return nil, fmt.Errorf("failed to unmarshal structured LLM response: %v", err)
	}

	return response["data"], nil
}

// Agents provides functionality for creating and managing AI agents within workflows.
// It enables workflows to create agents that can perform tasks and interact with users.
type Agents struct {
	client       *client.Client
	apiSecret    string
	clusterId    string
	workflowName string
	version      int
	executionId  string
}

// ReactAgentConfig holds the configuration for a React agent.
// It defines the agent's name, instructions, input, schema, and available tools.
type ReactAgentConfig struct {
	// Name of the agent
	Name string
	// Instructions for the agent
	Instructions string
	// Input for the agent
	Input string
	// Schema for the agent result
	Schema interface{}
	// Tools for the agent
	Tools []string
}

// Agent represents an AI agent that can interact with users and perform tasks.
// It provides methods for sending messages and receiving responses.
type Agent struct {
	client    *client.Client
	apiSecret string
	clusterId string
	runId     string
}

// SendMessage sends a message to the agent and waits for a response.
// It enables bidirectional communication with the agent.
func (a *Agent) SendMessage(message string) error {
	payload := map[string]interface{}{
		"message": message,
		"type":    "human",
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}

	headers := map[string]string{
		"Authorization": "Bearer " + a.apiSecret,
		"Content-Type":  "application/json",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/runs/%s/messages", a.clusterId, a.runId),
		Method:  "POST",
		Headers: headers,
		Body:    string(jsonPayload),
	}

	_, _, err, status := a.client.FetchData(options)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	if status != 201 {
		return fmt.Errorf("failed to send message, status: %d", status)
	}

	return nil
}

// React creates a React agent with the provided configuration.
// It initializes the agent and returns its result along with any interrupts.
// If interrupt is not nil, you must return it as the result of the workflow handler.
//
//	result, interrupt, err := ctx.Agents.React(ReactAgentConfig{
//		Name: "my-agent",
//		Instructions: "You are a helpful assistant",
//		Input: "Hello, how are you?",
//		Schema: struct {
//			Result string `json:"result"`
//		}{},
//	})
//
//	if err != nil {
//		// Handle error
//	}
//
//	if interrupt != nil {
//	  return interrupt, nil
//	}
//
// return result, nil
func (a *Agents) React(config ReactAgentConfig) (interface{}, *Interrupt, error) {
	// Convert schema to JSON schema if needed
	var resultSchema interface{}
	if config.Schema != nil {
		reflector := jsonschema.Reflector{DoNotReference: true}
		schema := reflector.Reflect(config.Schema)
		resultSchema = schema
	}

	// Create the run
	payload := map[string]interface{}{
		"name":         fmt.Sprintf("%s_%s", a.workflowName, config.Name),
		"systemPrompt": config.Instructions,
		"resultSchema": resultSchema,
		"tools":        prefixToolNames(config.Tools, a.workflowName),
		"onStatusChange": map[string]interface{}{
			"type":     "workflow",
			"statuses": []string{"failed", "done"},
			"workflow": map[string]interface{}{
				"executionId": a.executionId,
			},
		},
		"tags": map[string]interface{}{
			"workflow.name":        a.workflowName,
			"workflow.version":     fmt.Sprintf("%d", a.version),
			"workflow.executionId": a.executionId,
		},
		"initialPrompt": config.Input,
		"interactive":   true,
	}

	hashable, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to marshal run payload: %v", err)
	}

	hash := sha256.New()
	hash.Write(hashable)
	runId := fmt.Sprintf("%s_%s_%x", a.executionId, config.Name, hash.Sum(nil))

	payload["id"] = runId

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to marshal run payload: %v", err)
	}

	headers := map[string]string{
		"Authorization": "Bearer " + a.apiSecret,
		"Content-Type":  "application/json",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/runs", a.clusterId),
		Method:  "POST",
		Headers: headers,
		Body:    string(jsonPayload),
	}

	result, _, err, status := a.client.FetchData(options)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create run: %v", err)
	}

	if status != 201 {
		return nil, nil, fmt.Errorf("failed to create run, status: %d", status)
	}

	var response struct {
		Status string      `json:"status"`
		Result interface{} `json:"result"`
	}

	if err := json.Unmarshal([]byte(result), &response); err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal run response: %v", err)
	}

	if response.Status == "done" {
		return response.Result, nil, nil
	} else if response.Status == "failed" {
		return nil, nil, fmt.Errorf("agent %s failed", config.Name)
	} else {
		// Pause the workflow when the agent is not done
		return nil, GeneralInterrupt(fmt.Sprintf("Agent %s is not done", config.Name)), nil
	}
}

// Workflow represents a workflow in the Inferable system.
// It contains the workflow's configuration, handlers, and tools.
type Workflow struct {
	name            string
	description     string
	inputSchema     interface{}
	versionHandlers map[int]interface{}
	logger          Logger
	inferable       *Inferable
	tools           []Tool
	Tools           *WorkflowTools
}

// WorkflowTool represents a tool that can be used within a workflow.
// Tools provide additional functionality that can be invoked during workflow execution.
type WorkflowTool struct {
	// Name is the unique identifier for the tool.
	Name string
	// Description provides a human-readable explanation of the tool's purpose.
	Description string
	// InputSchema defines the expected structure of the tool input.
	InputSchema interface{}
	// Func is the function that implements the tool's functionality.
	Func interface{}
	// Config provides additional configuration for the tool.
	Config interface{}
}

// prefixToolNames prefixes tool names with the workflow name.
// This ensures that tool names are unique across different workflows.
func prefixToolNames(tools []string, workflowName string) []string {
	result := make([]string, len(tools))
	for i, tool := range tools {
		result[i] = fmt.Sprintf("tool_%s_%s", workflowName, tool)
	}
	return result
}

// Version sets the version for the workflow.
// It returns a WorkflowVersionBuilder that can be used to define the handler for this version.
func (w *Workflow) Version(version int) *WorkflowVersionBuilder {
	return &WorkflowVersionBuilder{
		workflow: w,
		version:  version,
	}
}

// WorkflowVersionBuilder builds a workflow version.
// It provides methods for defining the handler for a specific workflow version.
type WorkflowVersionBuilder struct {
	workflow *Workflow
	version  int
}

// Define defines the handler for the workflow version.
// The handler is a function that will be called when the workflow is executed.
func (b *WorkflowVersionBuilder) Define(handler interface{}) {
	if b.workflow.logger != nil {
		b.workflow.logger.Info("Defining workflow handler", map[string]interface{}{
			"version": b.version,
			"name":    b.workflow.name,
		})
	}

	// Create a wrapper function that adapts the handler to the expected format
	handlerType := reflect.TypeOf(handler)
	if handlerType.NumIn() != 2 {
		panic(fmt.Sprintf("workflow handler must have exactly two arguments: WorkflowContext and an input struct, got %d", handlerType.NumIn()))
	}

	// Check that the first argument is WorkflowContext
	if handlerType.In(0) != reflect.TypeOf(WorkflowContext{}) {
		panic("first argument of workflow handler must be WorkflowContext")
	}

	// Check that the second argument is a struct
	inputType := handlerType.In(1)
	if inputType.Kind() != reflect.Struct {
		panic("second argument of workflow handler must be a struct")
	}

	// Create a wrapper function that will be registered with the tool system
	// This wrapper will extract the input from the ContextInput and call the original handler
	wrapperFunc := reflect.MakeFunc(
		reflect.FuncOf(
			[]reflect.Type{inputType, reflect.TypeOf(ContextInput{})},
			[]reflect.Type{reflect.TypeOf((*interface{})(nil)).Elem(), reflect.TypeOf((*error)(nil)).Elem()},
			false,
		),
		func(args []reflect.Value) []reflect.Value {
			input := args[0]
			contextInput := args[1].Interface().(ContextInput)
			executionId := ""

			// Extract executionId from the input struct
			// Look for a field with json tag "executionId" or named "ExecutionID"
			inputType := input.Type()
			for i := 0; i < inputType.NumField(); i++ {
				field := inputType.Field(i)
				jsonTag := field.Tag.Get("json")
				if jsonTag == "executionId" || field.Name == "ExecutionID" {
					executionIdValue := input.Field(i)
					if executionIdValue.Kind() == reflect.String {
						executionId = executionIdValue.String()
						break
					}
				}
			}

			// Get clusterId from the workflow
			clusterId := b.workflow.inferable.clusterID

			// Create a WorkflowContext with proper implementations
			ctx := WorkflowContext{
				Input:    input.Interface(),
				Approved: contextInput.Approved,
				// Set up Log function
				//
				//	ctx.Log("info", map[string]interface{}{
				//		"message": "Starting workflow",
				//	})
				Log: func(status string, meta map[string]interface{}) error {
					// Log to the workflow logger if available
					if b.workflow.logger != nil {
						b.workflow.logger.Info(fmt.Sprintf("Workflow log: %s", status), meta)
					}

					// Create a workflow log entry in the cluster
					body, err := json.Marshal(map[string]interface{}{
						"status": status,
						"data":   meta,
					})
					if err != nil {
						return err
					}

					path := fmt.Sprintf("/clusters/%s/workflow-executions/%s/logs", clusterId, executionId)
					_, _, err, _ = b.workflow.inferable.client.FetchData(client.FetchDataOptions{
						Path:   path,
						Method: "POST",
						Body:   string(body),
					})

					return err
				},
				// Set up Memo function for caching results
				//
				//	result, err := ctx.Memo("unique-cache-key", func() (interface{}, error) {
				//		// This expensive operation will only be executed once for the given key
				//		// Subsequent calls with the same key will return the cached result
				//		return map[string]interface{}{
				//			"data": "Expensive computation result",
				//		}, nil
				//	})
				Memo: func(name string, fn func() (interface{}, error)) (interface{}, error) {
					// Create a key for the memo cache
					key := fmt.Sprintf("%s_memo_%s", executionId, name)

					// Try to get existing value from cluster KV store
					path := fmt.Sprintf("/clusters/%s/keys/%s/value", clusterId, key)
					respBody, _, err, statusCode := b.workflow.inferable.client.FetchData(client.FetchDataOptions{
						Path:   path,
						Method: "GET",
					})

					// If we successfully retrieved a value, deserialize and return it
					if err == nil && statusCode == 200 && respBody != "" {
						var kvResponse struct {
							Value string `json:"value"`
						}

						if err := json.Unmarshal([]byte(respBody), &kvResponse); err == nil && kvResponse.Value != "" {
							var result struct {
								Value interface{} `json:"value"`
							}

							if err := json.Unmarshal([]byte(kvResponse.Value), &result); err == nil && result.Value != nil {
								return result.Value, nil
							}
						}
					}

					// If no cached value exists or there was an error, execute the function
					result, err := fn()
					if err != nil {
						return nil, err
					}

					// Serialize the result
					serialized, err := json.Marshal(struct {
						Value interface{} `json:"value"`
					}{
						Value: result,
					})
					if err != nil {
						return result, err
					}

					// Store the result in the cluster KV store
					body, err := json.Marshal(map[string]interface{}{
						"value":      string(serialized),
						"onConflict": "doNothing",
					})
					if err != nil {
						return result, err
					}

					path = fmt.Sprintf("/clusters/%s/keys/%s", clusterId, key)
					_, _, err, _ = b.workflow.inferable.client.FetchData(client.FetchDataOptions{
						Path:   path,
						Method: "PUT",
						Body:   string(body),
					})

					return result, err
				},
				// Set up LLM for structured generation
				LLM: &LLM{
					client:      b.workflow.inferable.client,
					apiSecret:   b.workflow.inferable.apiSecret,
					clusterId:   clusterId,
					executionId: executionId,
				},
				// Set up Agents for agent functionality
				Agents: &Agents{
					client:       b.workflow.inferable.client,
					apiSecret:    b.workflow.inferable.apiSecret,
					clusterId:    clusterId,
					workflowName: b.workflow.name,
					version:      b.version,
					executionId:  executionId,
				},
			}

			// Call the original handler
			handlerValue := reflect.ValueOf(handler)
			results := handlerValue.Call([]reflect.Value{reflect.ValueOf(ctx), input})

			return results
		},
	)

	b.workflow.versionHandlers[b.version] = wrapperFunc.Interface()
}

// WorkflowTools provides tool registration functionality for workflows.
// It allows registering custom tools that can be used within a workflow.
type WorkflowTools struct {
	workflow *Workflow
}

// Register registers a tool for the workflow.
// The tool will be available for use within the workflow execution.
func (t *WorkflowTools) Register(tool WorkflowTool) {
	if t.workflow.logger != nil {
		t.workflow.logger.Info("Registering tool", map[string]interface{}{
			"name": t.workflow.name,
			"tool": tool.Name,
		})
	}

	// Create a Tool from the WorkflowTool
	t.workflow.tools = append(t.workflow.tools, Tool{
		Name:        tool.Name,
		Description: tool.Description,
		schema:      tool.InputSchema,
		Config:      tool.Config,
		Func:        tool.Func,
	})
}

// Listen starts listening for workflow executions.
// It registers the workflow and its tools with the Inferable service and begins
// processing incoming workflow execution requests.
func (w *Workflow) Listen() error {
	if w.inferable == nil {
		return fmt.Errorf("inferable instance is required")
	}

	if w.logger != nil {
		w.logger.Info("Starting workflow listeners", map[string]interface{}{
			"name":     w.name,
			"versions": reflect.ValueOf(w.versionHandlers).MapKeys(),
		})
	}

	// Register tools for the workflow
	tools := make([]Tool, 0)

	// Add workflow tools
	for _, tool := range w.tools {
		prefixedTool := Tool{
			Name:        fmt.Sprintf("tool_%s_%s", w.name, tool.Name),
			Description: tool.Description,
			schema:      tool.schema,
			Config:      tool.Config,
			Func:        tool.Func,
		}
		tools = append(tools, prefixedTool)
	}

	// Add version handlers as tools
	for version, handler := range w.versionHandlers {
		tools = append(tools, Tool{
			Name:        fmt.Sprintf("workflows_%s_%d", w.name, version),
			Description: w.description,
			schema:      w.inputSchema,
			Config:      map[string]interface{}{"private": true},
			Func:        handler,
		})
	}

	// Register tools with the inferable instance
	for _, tool := range tools {
		err := w.inferable.Tools.Register(tool)
		if err != nil {
			return fmt.Errorf("failed to register tool: %v", err)
		}
	}

	// Start listening
	err := w.inferable.Tools.Listen()
	if err != nil {
		return fmt.Errorf("failed to start workflow listeners: %v", err)
	}

	if w.logger != nil {
		w.logger.Info("Workflow listeners started", map[string]interface{}{
			"name": w.name,
		})
	}

	return nil
}

// Unlisten stops listening for workflow executions.
// It unregisters the workflow from the Inferable service and stops processing
// incoming workflow execution requests.
func (w *Workflow) Unlisten() error {
	if w.logger != nil {
		w.logger.Info("Stopping workflow listeners", map[string]interface{}{
			"name": w.name,
		})
	}

	w.inferable.Tools.Unlisten()

	if w.logger != nil {
		w.logger.Info("Workflow listeners stopped", map[string]interface{}{
			"name": w.name,
		})
	}

	return nil
}

// Workflows provides workflow management functionality.
// It allows creating and triggering workflows.
type Workflows struct {
	inferable *Inferable
}

// Create creates a new workflow with the provided configuration.
// It initializes the workflow with the given name, description, input schema, and logger.
// Returns a new Workflow instance that can be further configured.
func (w *Workflows) Create(config WorkflowConfig) *Workflow {
	// Validate that the InputSchema contains an ExecutionId field
	if config.InputSchema != nil {
		schemaType := reflect.TypeOf(config.InputSchema)
		if schemaType.Kind() == reflect.Struct {
			hasExecutionId := false
			for i := 0; i < schemaType.NumField(); i++ {
				field := schemaType.Field(i)
				jsonTag := field.Tag.Get("json")
				if jsonTag == "executionId" {
					hasExecutionId = true
					break
				}
			}
			if !hasExecutionId {
				panic("WorkflowConfig.InputSchema must contain an ExecutionId field with json tag \"executionId\"")
			}
		}
	}

	workflow := &Workflow{
		name:            config.Name,
		description:     config.Description,
		inputSchema:     config.InputSchema,
		versionHandlers: make(map[int]interface{}),
		logger:          config.Logger,
		inferable:       w.inferable,
		tools:           make([]Tool, 0),
	}

	// Initialize the Tools field
	workflow.Tools = &WorkflowTools{
		workflow: workflow,
	}

	return workflow
}

// Trigger triggers a workflow execution with the provided input.
// It sends a request to the Inferable service to start a new execution of the specified workflow.
// The executionId uniquely identifies this execution instance.
func (w *Workflows) Trigger(workflowName string, executionId string, input interface{}) error {
	clusterId, err := w.inferable.getClusterId()
	if err != nil {
		return fmt.Errorf("failed to get cluster id: %v", err)
	}

	// Extract the input fields
	inputMap, ok := input.(map[string]interface{})
	if !ok {
		return fmt.Errorf("input must be a map[string]interface{}")
	}

	// add the executionId to the input
	inputMap["executionId"] = executionId

	jsonPayload, err := json.Marshal(inputMap)
	if err != nil {
		return fmt.Errorf("failed to marshal input: %v", err)
	}

	headers := map[string]string{
		"Authorization": "Bearer " + w.inferable.apiSecret,
		"Content-Type":  "application/json",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/workflows/%s/executions", clusterId, workflowName),
		Method:  "POST",
		Headers: headers,
		Body:    string(jsonPayload),
	}

	_, _, err, status := w.inferable.fetchData(options)
	if err != nil {
		return fmt.Errorf("failed to trigger workflow: %v", err)
	}

	if status != 201 {
		return fmt.Errorf("failed to trigger workflow, status: %d", status)
	}

	return nil
}

// Helpers provides helper functions for workflows
var Helpers = struct {
	// StructuredPrompt creates a structured prompt with facts and goals
	StructuredPrompt func(params struct {
		Facts []string
		Goals []string
	}) string
}{
	StructuredPrompt: func(params struct {
		Facts []string
		Goals []string
	}) string {
		result := "# Facts\n"
		for _, fact := range params.Facts {
			result += "- " + fact + "\n"
		}
		result += "# Your goals\n"
		for _, goal := range params.Goals {
			result += "- GOAL: " + goal + "\n"
		}
		return result
	},
}
