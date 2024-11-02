package inferable

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/invopop/jsonschema"

	"github.com/inferablehq/inferable/sdk-go/internal/client"
)

const (
	MaxConsecutivePollFailures = 50
	DefaultRetryAfter          = 10
)

type Function struct {
	Name        string
	Description string
	schema      interface{}
	Config      interface{}
	Func        interface{}
}

type service struct {
	Name       string
	Functions  map[string]Function
	inferable  *Inferable
	clusterId  string
	ctx        context.Context
	cancel     context.CancelFunc
	retryAfter int
}

type callMessage struct {
	Id       string      `json:"id"`
	Function string      `json:"function"`
	Input    interface{} `json:"input"`
}

type callResultMeta struct {
	FunctionExecutionTime int64 `json:"functionExecutionTime,omitempty"`
}

type callResult struct {
	Result     interface{}    `json:"result"`
	ResultType string         `json:"resultType"`
	Meta       callResultMeta `json:"meta"`
}

type FunctionReference struct {
	Service  string `json:"service"`
	Function string `json:"function"`
}

// Registers a function against the service.
//
// Parameters:
// - input: The function definition.
//
// Returns:
// A function reference.
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
func (s *service) RegisterFunc(fn Function) (*FunctionReference, error) {
	if s.isPolling() {
		return nil, fmt.Errorf("functions must be registered before starting the service")
	}

	if _, exists := s.Functions[fn.Name]; exists {
		return nil, fmt.Errorf("function with name '%s' already registered for service '%s'", fn.Name, s.Name)
	}

	// Validate that the function has exactly one argument and it's a struct
	fnType := reflect.TypeOf(fn.Func)
	if fnType.NumIn() != 1 {
		return nil, fmt.Errorf("function '%s' must have exactly one argument", fn.Name)
	}
	argType := fnType.In(0)
	if argType.Kind() != reflect.Struct {
		return nil, fmt.Errorf("function '%s' first argument must be a struct", fn.Name)
	}

	// Get the schema for the input struct
	reflector := jsonschema.Reflector{}
	schema := reflector.Reflect(reflect.New(argType).Interface())

	if schema == nil {
		return nil, fmt.Errorf("failed to get schema for function '%s'", fn.Name)
	}

	// Extract the relevant part of the schema
	defs, ok := schema.Definitions[argType.Name()]

	// If the definition is not found, use the whole schema.
	// This tends to happen for inline structs.
	// For example: func(input struct { A int `json:"a"` }) int
	if !ok {
		defs = schema
	}

	defsString, err := json.Marshal(defs)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal schema for function '%s': %v", fn.Name, err)
	}

	if strings.Contains(string(defsString), "\"$ref\":\"#/$defs") {
		return nil, fmt.Errorf("schema for function '%s' contains a $ref to an external definition. this is currently not supported. see https://go.inferable.ai/go-schema-limitation for details", fn.Name)
	}

	defs.AdditionalProperties = nil
	fn.schema = defs

	s.Functions[fn.Name] = fn
	return &FunctionReference{Service: s.Name, Function: fn.Name}, nil
}

func (s *service) registerMachine() error {
	// Check if there are any registered functions
	if len(s.Functions) == 0 {
		return fmt.Errorf("cannot register service '%s': no functions registered", s.Name)
	}

	// Prepare the payload for registration
	payload := struct {
		Service   string `json:"service"`
		Functions []struct {
			Name        string `json:"name"`
			Description string `json:"description,omitempty"`
			Schema      string `json:"schema,omitempty"`
		} `json:"functions,omitempty"`
	}{
		Service: s.Name,
	}

	// Add registered functions to the payload
	for _, fn := range s.Functions {
		schemaJSON, err := json.Marshal(fn.schema)
		if err != nil {
			return fmt.Errorf("failed to marshal schema for function '%s': %v", fn.Name, err)
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

	// Marshal the payload to JSON
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %v", err)
	}

	// Prepare headers
	headers := map[string]string{
		"Authorization":          "Bearer " + s.inferable.apiSecret,
		"X-Machine-ID":           s.inferable.machineID,
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

	responseData, _, err, _ := s.inferable.fetchData(options)
	if err != nil {
		return fmt.Errorf("failed to register machine: %v", err)
	}

	// Parse the response
	var response struct {
		ClusterId string `json:"clusterId"`
	}

	err = json.Unmarshal(responseData, &response)
	if err != nil {
		return fmt.Errorf("failed to parse registration response: %v", err)
	}

	s.clusterId = response.ClusterId

	return nil
}

// Start initializes the service, registers the machine, and starts polling for messages
func (s *service) Start() error {
	err := s.registerMachine()
	if err != nil {
		return fmt.Errorf("failed to register machine: %v", err)
	}

	s.ctx, s.cancel = context.WithCancel(context.Background())
	s.retryAfter = 0

	go func() {
		failureCount := DefaultRetryAfter
		for {
			time.Sleep(time.Duration(s.retryAfter) * time.Second)

			select {
			case <-s.ctx.Done():
				return
			default:
				err := s.poll()

				if err != nil {
					failureCount++

					if failureCount > MaxConsecutivePollFailures {
						log.Printf("Too many consecutive poll failures, exiting service: %s", s.Name)
						s.Stop()
					}

					log.Printf("Failed to poll: %v", err)
				}
			}
		}
	}()

	log.Printf("Service '%s' started and polling for messages", s.Name)
	return nil
}

// Stop stops the service and cancels the polling
func (s *service) Stop() {
	if s.cancel != nil {
		s.cancel()
		log.Printf("Service '%s' stopped", s.Name)
	}
}

func (s *service) poll() error {
	headers := map[string]string{
		"Authorization":          "Bearer " + s.inferable.apiSecret,
		"X-Machine-ID":           s.inferable.machineID,
		"X-Machine-SDK-Version":  Version,
		"X-Machine-SDK-Language": "go",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/calls?acknowledge=true&service=%s&status=pending&limit=10", s.clusterId, s.Name),
		Method:  "GET",
		Headers: headers,
	}

	result, respHeaders, err, status := s.inferable.fetchData(options)

	if status == 410 {
		s.registerMachine()
	}

	if err != nil {
		return fmt.Errorf("failed to poll calls: %v", err)
	}

	if retryAfter, ok := respHeaders["Retry-After"]; ok {
		for _, v := range retryAfter {
			if i, err := strconv.Atoi(v); err == nil {
				s.retryAfter = i
			}
		}
	}

	parsed := []callMessage{}

	err = json.Unmarshal(result, &parsed)
	if err != nil {
		return fmt.Errorf("failed to parse poll response: %v", err)
	}

	errors := []string{}
	for _, msg := range parsed {
		err := s.handleMessage(msg)
		if err != nil {
			errors = append(errors, err.Error())
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("failed to handle messages: %v", errors)
	}

	return nil
}

func (s *service) handleMessage(msg callMessage) error {
	// Find the target function
	fn, ok := s.Functions[msg.Function]
	if !ok {
		log.Printf("Received call for unknown function: %s", msg.Function)
		return nil
	}

	// Create a new instance of the function's input type
	fnType := reflect.TypeOf(fn.Func)
	argType := fnType.In(0)
	argPtr := reflect.New(argType)

	inputJson, err := json.Marshal(msg.Input)

	if err != nil {
		return fmt.Errorf("failed to marshal input: %v", err)
	}

	err = json.Unmarshal(inputJson, argPtr.Interface())
	if err != nil {
		return fmt.Errorf("failed to unmarshal input: %v", err)
	}

	start := time.Now()
	// Call the function with the unmarshaled argument
	fnValue := reflect.ValueOf(fn.Func)
	returnValues := fnValue.Call([]reflect.Value{argPtr.Elem()})

	resultType := "resolution"
	resultValue := returnValues[0].Interface()

	// Check if ANY of the return values is an error
	for _, v := range returnValues {
		if v.Type().AssignableTo(reflect.TypeOf((*error)(nil)).Elem()) && v.Interface() != nil {
			resultType = "rejection"
			// Serialize the error
			resultValue = v.Interface().(error).Error()
			break
		}
	}

	result := callResult{
		Result:     resultValue,
		ResultType: resultType,
		Meta: callResultMeta{
			FunctionExecutionTime: int64(time.Since(start).Milliseconds()),
		},
	}

	// Persist the job result
	if err := s.persistJobResult(msg.Id, result); err != nil {
		return fmt.Errorf("failed to persist job result: %v", err)
	}

	return nil
}

func (s *service) persistJobResult(jobID string, result callResult) error {
	payloadJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal payload for persistJobResult: %v", err)
	}

	headers := map[string]string{
		"Authorization":          "Bearer " + s.inferable.apiSecret,
		"X-Machine-ID":           s.inferable.machineID,
		"X-Machine-SDK-Version":  Version,
		"X-Machine-SDK-Language": "go",
	}

	options := client.FetchDataOptions{
		Path:    fmt.Sprintf("/clusters/%s/calls/%s/result", s.clusterId, jobID),
		Method:  "POST",
		Headers: headers,
		Body:    string(payloadJSON),
	}

	_, _, err, _ = s.inferable.fetchData(options)
	if err != nil {
		return fmt.Errorf("failed to persist job result: %v", err)
	}

	return nil
}

func (s *service) getSchema() (map[string]interface{}, error) {
	if len(s.Functions) == 0 {
		return nil, fmt.Errorf("no functions registered for service '%s'", s.Name)
	}

	schema := make(map[string]interface{})

	for _, fn := range s.Functions {
		schema[fn.Name] = map[string]interface{}{
			"input": fn.schema,
			"name":  fn.Name,
		}
	}

	return schema, nil
}

func (s *service) isPolling() bool {
	return s.cancel != nil
}
