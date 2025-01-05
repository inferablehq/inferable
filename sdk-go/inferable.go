// Package inferable provides a client for interacting with the Inferable API.
package inferable

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"time"

	"github.com/inferablehq/inferable/sdk-go/internal/client"
	"github.com/inferablehq/inferable/sdk-go/internal/util"
)

// Version of the inferable package
const Version = "0.1.34"

const (
	DefaultAPIEndpoint = "https://api.inferable.ai"
)

type functionRegistry struct {
	services map[string]*service
}

type Inferable struct {
	client           *client.Client
	apiEndpoint      string
	apiSecret        string
	functionRegistry functionRegistry
	machineID        string
	clusterID        string
	// Convenience reference to a service with the name 'default'.
	//
	// Returns:
	// A registered service instance.
	//
	// Example:
	//
	//  // Create a new Inferable instance with an API secret
	//  client := inferable.New(InferableOptions{
	//      ApiSecret: "API_SECRET",
	//  })
	//
	//  client.Default.RegisterFunc(Function{
	//    Func:        func(input EchoInput) string {
	//      didCallSayHello = true
	//      return "Hello " + input.Input
	//    },
	//    Name:        "SayHello",
	//    Description: "A simple greeting function",
	//  })
	//
	//  // Start the service
	//  client.Default.Start()
	//
	//  // Stop the service on shutdown
	//  defer client.Default.Stop()
	Default *service
}

type InferableOptions struct {
	APIEndpoint string
	APISecret   string
	MachineID   string
}

// Input object for onStatusChange functions
// https://docs.inferable.ai/pages/runs#onstatuschange
type OnStatusChangeInput struct {
	Status string      `json:"status"`
	RunId  string      `json:"runId"`
	Result interface{} `json:"result"`
	Tags   interface{} `json:"tags"`
}

// Input object for handleCustomAuth functions
// https://docs.inferable.ai/pages/custom-auth
type HandleCustomAuthInput struct {
	Token string `json:"token"`
}

type runResult = OnStatusChangeInput

type RunTemplate struct {
	ID    string                 `json:"id"`
	Input map[string]interface{} `json:"input"`
}

type OnStatusChange struct {
	Function *FunctionReference `json:"function"`
}

type CreateRunInput struct {
	AttachedFunctions []*FunctionReference `json:"attachedFunctions,omitempty"`
	InitialPrompt     string               `json:"initialPrompt"`
	OnStatusChange    *OnStatusChange      `json:"onStatusChange,omitempty"`
	ResultSchema      interface{}          `json:"resultSchema,omitempty"`
	Metadata          map[string]string    `json:"metadata,omitempty"`
	Template          *RunTemplate         `json:"template,omitempty"`
	ReasoningTraces   bool                 `json:"reasoningTraces"`
	Interactive       bool                 `json:"interactive"`
	CallSummarization bool                 `json:"callSummarization"`
}

type PollOptions struct {
	MaxWaitTime *time.Duration
	Interval    *time.Duration
}

type runReference struct {
	ID   string
	Poll func(options *PollOptions) (*runResult, error)
}

func New(options InferableOptions) (*Inferable, error) {
	if options.APIEndpoint == "" {
		options.APIEndpoint = DefaultAPIEndpoint
	}
	client, err := client.NewClient(client.ClientOptions{
		Endpoint: options.APIEndpoint,
		Secret:   options.APISecret,
	})
	if err != nil {
		return nil, fmt.Errorf("error creating client: %v", err)
	}

	machineID := options.MachineID
	if machineID == "" {
		machineID = util.GenerateMachineID(8)
	}

	inferable := &Inferable{
		client:           client,
		apiEndpoint:      options.APIEndpoint,
		apiSecret:        options.APISecret,
		functionRegistry: functionRegistry{services: make(map[string]*service)},
		machineID:        machineID,
	}

	// Automatically register the default service
	inferable.Default, err = inferable.RegisterService("default")
	if err != nil {
		return nil, fmt.Errorf("error registering default service: %v", err)
	}

	return inferable, nil
}

// Registers a service with Inferable. This will register all functions on the service.
//
// Parameters:
// - input: The service definition.
//
// Returns:
// A registered service instance.
//
// Example:
//
//	// Create a new Inferable instance with an API secret
//	client := inferable.New(InferableOptions{
//	    ApiSecret: "API_SECRET",
//	})
//
//	// Define and register the service
//	service := client.Service("MyService")
//
//	sayHello, err := service.RegisterFunc(Function{
//	  Func:        func(input EchoInput) string {
//	    didCallSayHello = true
//	    return "Hello " + input.Input
//	  },
//	  Name:        "SayHello",
//	  Description: "A simple greeting function",
//	})
//
//	// Start the service
//	service.Start()
//
//	// Stop the service on shutdown
//	defer service.Stop()
func (i *Inferable) RegisterService(serviceName string) (*service, error) {
	if _, exists := i.functionRegistry.services[serviceName]; exists {
		return nil, fmt.Errorf("service with name '%s' already registered", serviceName)
	}

	service := &service{
		Name:      serviceName,
		Functions: make(map[string]Function),
		inferable: i, // Set the reference to the Inferable instance
	}
	i.functionRegistry.services[serviceName] = service
	return service, nil
}

func (i *Inferable) getRun(runID string) (*runResult, error) {
	// Prepare headers
	headers := map[string]string{
		"Authorization":          "Bearer " + i.apiSecret,
		"X-Machine-ID":           i.machineID,
		"X-Machine-SDK-Version":  Version,
		"X-Machine-SDK-Language": "go",
	}

	clusterId, err := i.getClusterId()
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster id: %v", err)
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/runs/%s", clusterId, runID),
		Method:  "GET",
		Headers: headers,
	}

	responseData, _, err, _ := i.fetchData(options)
	if err != nil {
		return nil, fmt.Errorf("failed to get run: %v", err)
	}
	var result runResult
	err = json.Unmarshal(responseData, &result)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %v", err)
	}
	return &result, nil
}

// Creates a run and returns a reference to it.
//
// Parameters:
// - input: The run definition.
//
// Returns:
// A run reference.
//
// Example:
//
//	// Create a new Inferable instance with an API secret
//	client := inferable.New(InferableOptions{
//	    ApiSecret: "API_SECRET",
//	})
//
//	run, err := client.Run(CreateRunInput{
//	    Message: "Hello world",
//	})
//
//	if err != nil {
//	    log.Fatal("Failed to create run:", err)
//	}
//
//	fmt.Println("Started run with ID:", run.ID)
//
//	result, err := run.Poll()
//	if err != nil {
//	    log.Fatal("Failed to poll run result:", err)
//	}
//
//	fmt.Println("Run result:", result)
func (i *Inferable) CreateRun(input CreateRunInput) (*runReference, error) {
	clusterId, err := i.getClusterId()
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster id: %v", err)
	}

	// Marshal the payload to JSON
	jsonPayload, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %v", err)
	}

	// Prepare headers
	headers := map[string]string{
		"Authorization":          "Bearer " + i.apiSecret,
		"X-Machine-ID":           i.machineID,
		"X-Machine-SDK-Version":  Version,
		"X-Machine-SDK-Language": "go",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/runs", clusterId),
		Method:  "POST",
		Headers: headers,
		Body:    string(jsonPayload),
	}

	responseData, _, err, _ := i.fetchData(options)
	if err != nil {
		return nil, fmt.Errorf("failed to create run: %v", err)
	}

	// Parse the response
	var response struct {
		ID string `json:"id"`
	}

	err = json.Unmarshal(responseData, &response)
	if err != nil {
		return nil, fmt.Errorf("failed to parse run response: %v", err)
	}

	return &runReference{
		ID: response.ID,
		Poll: func(options *PollOptions) (*runResult, error) {
			// Default values for polling options
			maxWaitTime := 60 * time.Second
			interval := 500 * time.Millisecond

			if options != nil {
				if options.MaxWaitTime != nil {
					maxWaitTime = *options.MaxWaitTime
				}

				if options.Interval != nil {
					interval = *options.Interval
				}
			}

			start := time.Now()
			end := start.Add(maxWaitTime)

			for time.Now().Before(end) {
				pollResult, err := i.getRun(response.ID)
				if err != nil {
					return nil, fmt.Errorf("failed to poll for run: %w", err)
				}

				if pollResult.Status != "paused" && pollResult.Status != "pending" && pollResult.Status != "running" {
					return pollResult, nil
				}

				time.Sleep(interval)
			}

			return nil, fmt.Errorf("max wait time reached, polling stopped")
		},
	}, nil
}

func (i *Inferable) callFunc(serviceName, funcName string, args ...interface{}) ([]reflect.Value, error) {
	service, exists := i.functionRegistry.services[serviceName]
	if !exists {
		return nil, fmt.Errorf("service with name '%s' not found", serviceName)
	}

	fn, exists := service.Functions[funcName]
	if !exists {
		return nil, fmt.Errorf("function with name '%s' not found in service '%s'", funcName, serviceName)
	}

	// Get the reflect.Value of the function
	fnValue := reflect.ValueOf(fn.Func)

	// Check if the number of arguments is correct
	if len(args) != fnValue.Type().NumIn() {
		return nil, fmt.Errorf("invalid number of arguments for function '%s'", funcName)
	}

	// Prepare the arguments
	inArgs := make([]reflect.Value, len(args))
	for i, arg := range args {
		inArgs[i] = reflect.ValueOf(arg)
	}

	// Call the function
	return fnValue.Call(inArgs), nil
}

func (i *Inferable) toJSONDefinition() ([]byte, error) {
	definitions := make([]map[string]interface{}, 0)

	for serviceName, service := range i.functionRegistry.services {
		serviceDef := make(map[string]interface{})
		functions := make([]map[string]interface{}, 0)

		for _, function := range service.Functions {
			funcDef := map[string]interface{}{
				"name":        function.Name,
				"description": function.Description,
				"schema":      function.schema,
			}
			functions = append(functions, funcDef)
		}

		serviceDef["service"] = serviceName
		serviceDef["functions"] = functions

		definitions = append(definitions, serviceDef)
	}

	return json.MarshalIndent(definitions, "", "  ")
}

func (i *Inferable) fetchData(options client.FetchDataOptions) ([]byte, http.Header, error, int) {
	// Add default Content-Type header if not present
	if options.Headers == nil {
		options.Headers = make(map[string]string)
	}
	if _, exists := options.Headers["Content-Type"]; !exists && options.Body != "" {
		options.Headers["Content-Type"] = "application/json"
	}

	data, headers, err, status := i.client.FetchData(options)
	return []byte(data), headers, err, status
}

func (i *Inferable) serverOk() error {
	data, _, err, _ := i.client.FetchData(client.FetchDataOptions{
		Path:   "/live",
		Method: "GET",
	})
	if err != nil {
		return fmt.Errorf("error fetching data from /live: %v", err)
	}

	var response struct {
		Status string `json:"status"`
	}

	// Convert string to []byte before unmarshaling
	if err := json.Unmarshal([]byte(data), &response); err != nil {
		return fmt.Errorf("error unmarshaling response: %v", err)
	}

	if response.Status != "ok" {
		return fmt.Errorf("unexpected status from /live: %s", response.Status)
	}

	return nil
}

func (i *Inferable) getClusterId() (string, error) {
	if i.clusterID == "" {
		clusterId, err := i.registerMachine(nil)
		if err != nil {
			return "", fmt.Errorf("failed to register machine: %v", err)
		}

		i.clusterID = clusterId
	}

	return i.clusterID, nil
}

func (i *Inferable) registerMachine(s *service) (string, error) {

	// Prepare the payload for registration
	payload := struct {
		Service   string `json:"service,omitempty"`
		Functions []struct {
			Name        string `json:"name"`
			Description string `json:"description,omitempty"`
			Schema      string `json:"schema,omitempty"`
		} `json:"functions,omitempty"`
	}{}

	if s != nil {
		payload.Service = s.Name

		// Check if there are any registered functions
		if len(s.Functions) == 0 {
			return "", fmt.Errorf("cannot register service '%s': no functions registered", s.Name)
		}

		// Add registered functions to the payload
		for _, fn := range s.Functions {
			schemaJSON, err := json.Marshal(fn.schema)
			if err != nil {
				return "", fmt.Errorf("failed to marshal schema for function '%s': %v", fn.Name, err)
			}

			payload.Functions = append(payload.Functions, struct {
				Name        string `json:"name"`
				Description string `json:"description,omitempty"`
				Schema      string `json:"schema,omitempty"`
			}{
				Name:        fn.Name,
				Description: fn.Description,
				Schema:      string(schemaJSON),
			})
		}
	}

	// Marshal the payload to JSON
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %v", err)
	}

	// Prepare headers
	headers := map[string]string{
		"Authorization":          "Bearer " + i.apiSecret,
		"X-Machine-ID":           i.machineID,
		"X-Machine-SDK-Version":  Version,
		"X-Machine-SDK-Language": "go",
	}

	// Call the registerMachine endpoint
	options := client.FetchDataOptions{
		Path:    "/machines",
		Method:  "POST",
		Headers: headers,
		Body:    string(jsonPayload),
	}

	responseData, _, err, _ := i.fetchData(options)
	if err != nil {
		return "", fmt.Errorf("failed to register machine: %v", err)
	}

	// Parse the response
	var response struct {
		ClusterId string `json:"clusterId"`
	}

	err = json.Unmarshal(responseData, &response)
	if err != nil {
		return "", fmt.Errorf("failed to parse registration response: %v", err)
	}

	return response.ClusterId, nil
}
