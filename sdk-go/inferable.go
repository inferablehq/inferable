// Package inferable provides a client for interacting with the Inferable API.
package inferable

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"

	"github.com/inferablehq/inferable/sdk-go/internal/client"
	"github.com/inferablehq/inferable/sdk-go/internal/util"
)

// Version of the inferable package
const Version = "0.1.42"

const (
	DefaultAPIEndpoint = "https://api.inferable.ai"
)

type Inferable struct {
	client      *client.Client
	apiEndpoint string
	apiSecret   string
	machineID   string
	clusterID   string
	Tools       *pollingAgent
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
	//  client.Tools.Register(Function{
	//    Func:        func(input EchoInput) string {
	//      didCallSayHello = true
	//      return "Hello " + input.Input
	//    },
	//    Name:        "SayHello",
	//    Description: "A simple greeting function",
	//  })
	//
	//  // Start the service
	//  client.Tools.Listen()
	//
	//  // Stop the service on shutdown
	//  defer client.Default.Stop()
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
		client:      client,
		apiEndpoint: options.APIEndpoint,
		apiSecret:   options.APISecret,
		machineID:   machineID,
	}

	// Automatically register the default service
	inferable.Tools, err = inferable.createPollingAgent()
	if err != nil {
		return nil, fmt.Errorf("error creating polling agent: %v", err)
	}

	return inferable, nil
}

func (i *Inferable) createPollingAgent() (*pollingAgent, error) {

	agent := &pollingAgent{
		Tools:     make(map[string]Tool),
		inferable: i, // Set the reference to the Inferable instance
	}
	return agent, nil
}

func (i *Inferable) callFunc(funcName string, args ...interface{}) ([]reflect.Value, error) {
	fn, exists := i.Tools.Tools[funcName]
	if !exists {
		return nil, fmt.Errorf("function with name '%s' not found", funcName)
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

func (i *Inferable) registerMachine(s *pollingAgent) (string, error) {

	// Prepare the payload for registration
	payload := struct {
		Service string `json:"service,omitempty"`
		Tools   []struct {
			Name        string `json:"name"`
			Description string `json:"description,omitempty"`
			Schema      string `json:"schema,omitempty"`
		} `json:"tools,omitempty"`
	}{}

	if s != nil {
		// Check if there are any registered functions
		if len(s.Tools) == 0 {
			return "", fmt.Errorf("cannot register machine with no functions")
		}

		// Add registered functions to the payload
		for _, fn := range s.Tools {
			schemaJSON, err := json.Marshal(fn.schema)
			if err != nil {
				return "", fmt.Errorf("failed to marshal schema for function '%s': %v", fn.Name, err)
			}

			payload.Tools = append(payload.Tools, struct {
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
