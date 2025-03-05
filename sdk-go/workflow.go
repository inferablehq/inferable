package inferable

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/inferablehq/inferable/sdk-go/internal/client"
	"github.com/invopop/jsonschema"
)

// WorkflowInput is the base input type for all workflows
type WorkflowInput struct {
	ExecutionID string `json:"executionId"`
}

// Logger interface for workflow logging
type Logger interface {
	Info(message string, meta map[string]interface{})
	Error(message string, meta map[string]interface{})
}

// WorkflowConfig holds the configuration for a workflow
type WorkflowConfig struct {
	Name        string
	Description string
	InputSchema interface{}
	Logger      Logger
}

// WorkflowContext provides context for workflow execution
type WorkflowContext struct {
	// Input for the workflow
	Input interface{}
	// Approved indicates if the workflow is approved
	Approved bool
	// LLM functionality for the workflow
	LLM *LLM
	// Memo caches results for the workflow
	Memo func(name string, fn func() (interface{}, error)) (interface{}, error) `json:"-" jsonschema:"-"`
	// Log logs information for the workflow
	Log func(status string, meta map[string]interface{}) error `json:"-" jsonschema:"-"`
	// Agents provides agent functionality for the workflow
	Agents *Agents
}

// LLM provides LLM functionality for workflows
type LLM struct {
	client      *client.Client
	apiSecret   string
	clusterId   string
	executionId string
}

// StructuredInput defines the input for structured LLM calls
type StructuredInput struct {
	Input  string      `json:"input"`
	Schema interface{} `json:"schema"`
}

// Structured generates structured output from an LLM
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

// Agents provides agent functionality for workflows
type Agents struct {
	client       *client.Client
	apiSecret    string
	clusterId    string
	workflowName string
	version      int
	executionId  string
}

// ReactAgentConfig defines the configuration for a react agent
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

// Agent represents an agent instance
type Agent struct {
	client    *client.Client
	apiSecret string
	clusterId string
	runId     string
}

// SendMessage sends a message to the agent
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

// React creates a react agent
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

// Workflow represents a workflow
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

// WorkflowTool represents a tool for a workflow
type WorkflowTool struct {
	Name        string
	Description string
	InputSchema interface{}
	Func        interface{}
	Config      interface{}
}

// prefixToolNames prefixes tool names with the workflow name
func prefixToolNames(tools []string, workflowName string) []string {
	result := make([]string, len(tools))
	for i, tool := range tools {
		result[i] = fmt.Sprintf("tool_%s_%s", workflowName, tool)
	}
	return result
}

// Version sets the version for the workflow
func (w *Workflow) Version(version int) *WorkflowVersionBuilder {
	return &WorkflowVersionBuilder{
		workflow: w,
		version:  version,
	}
}

// WorkflowVersionBuilder builds a workflow version
type WorkflowVersionBuilder struct {
	workflow *Workflow
	version  int
}

// Define defines the handler for the workflow version
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
				Log: func(status string, meta map[string]interface{}) error {
					// In a real implementation, this would log to the workflow log
					if b.workflow.logger != nil {
						b.workflow.logger.Info(fmt.Sprintf("Workflow log: %s", status), meta)
					}
					return nil
				},
				// Set up Memo function for caching results
				Memo: func(name string, fn func() (interface{}, error)) (interface{}, error) {
					// In a real implementation, this would check for cached results
					// and store new results
					return fn()
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

// Tools provides tool registration for the workflow
type WorkflowTools struct {
	workflow *Workflow
}

// Register registers a tool for the workflow
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

// Listen starts listening for workflow executions
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

// Unlisten stops listening for workflow executions
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

// Workflows provides workflow functionality
type Workflows struct {
	inferable *Inferable
}

// Create creates a new workflow
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

// Trigger triggers a workflow execution
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
