package inferable

import (
	"encoding/json"
	"fmt"
	"testing"

	"bytes"
	"net/http"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/inferablehq/inferable/sdk-go/internal/util"
)

func TestRegisterFunc(t *testing.T) {
	_, _, _, apiEndpoint := util.GetTestVars()

	i, _ := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   "test-secret",
	})
	type TestInput struct {
		A int `json:"a"`
		B int `json:"b"`
	}

	testFunc := func(input TestInput, ctx ContextInput) int { return input.A + input.B }
	err := i.Tools.Register(Tool{
		Func:        testFunc,
		Name:        "TestFunc",
		Description: "Test function",
	})
	require.NoError(t, err)

	// Try to register the same function again
	err = i.Tools.Register(Tool{
		Func: testFunc,
		Name: "TestFunc",
	})
	assert.Error(t, err)

	// Try to register a function with invalid input
	invalidFunc := func(a, b int) int { return a + b }
	err = i.Tools.Register(Tool{
		Func: invalidFunc,
		Name: "InvalidFunc",
	})
	assert.Error(t, err)
}

func TestRegisterFuncWithInlineStruct(t *testing.T) {
	_, _, _, apiEndpoint := util.GetTestVars()

	i, _ := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   "test-secret",
	})
	testFunc := func(input struct {
		A int `json:"a"`
		B int `json:"b"`
	}, ctx ContextInput) int {
		return input.A + input.B
	}
	err := i.Tools.Register(Tool{
		Func:        testFunc,
		Name:        "TestFunc",
		Description: "Test function",
	})
	require.NoError(t, err)

	// Try to register the same function again
	err = i.Tools.Register(Tool{
		Func: testFunc,
		Name: "TestFunc",
	})
	assert.Error(t, err)

	// Try to register a function with invalid input
	invalidFunc := func(a, b int) int { return a + b }
	err = i.Tools.Register(Tool{
		Func: invalidFunc,
		Name: "InvalidFunc",
	})
	assert.Error(t, err)
}

func TestRegistrationAndConfig(t *testing.T) {
	machineSecret, _, _, apiEndpoint := util.GetTestVars()

	machineID := "random-machine-id"

	// Create a new Inferable instance
	i, err := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   machineSecret,
		MachineID:   machineID,
	})
	require.NoError(t, err)

	// Register a service
	require.NoError(t, err)

	// Register a test function
	type TestInput struct {
		A int `json:"a"`
		B int `json:"b"`
		C []struct {
			D int           `json:"d"`
			E string        `json:"e"`
			F []interface{} `json:"f"`
		} `json:"c"`
	}

	testFunc := func(input TestInput, ctx ContextInput) int { return input.A + input.B }

	err = i.Tools.Register(Tool{
		Func:        testFunc,
		Name:        "TestFunc",
		Description: "Test function",
	})

	require.NoError(t, err)

	// Call Listen to trigger registration
	err = i.Tools.Listen()
	require.NoError(t, err)
}

func TestServiceStartAndReceiveMessage(t *testing.T) {
	machineSecret, consumeSecret, clusterId, apiEndpoint := util.GetTestVars()

	machineID := "random-machine-id"

	// Create a new Inferable instance
	i, err := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   machineSecret,
		MachineID:   machineID,
	})
	require.NoError(t, err)

	// Register a test function
	type TestInput struct {
		Message string `json:"message"`
	}

	testFunc := func(input TestInput, ctx ContextInput) string { return "Received: " + input.Message }

	err = i.Tools.Register(Tool{
		Func:        testFunc,
		Name:        "TestFunc",
		Description: "Test function",
	})
	require.NoError(t, err)

	// Start the service
	err = i.Tools.Listen()
	require.NoError(t, err)

	// Ensure the service is stopped at the end of the test
	defer i.Tools.Unlisten()

	// Use executeJobSync to invoke the function
	testMessage := "Hello, SQS!"
	executeCallUrl := fmt.Sprintf("%s/clusters/%s/jobs?waitTime=20", apiEndpoint, clusterId)
	payload := map[string]interface{}{
		"service":  "v2",
		"function": "TestFunc",
		"input": map[string]string{
			"message": testMessage,
		},
	}

	jsonPayload, err := json.Marshal(payload)
	require.NoError(t, err)

	req, err := http.NewRequest("POST", executeCallUrl, bytes.NewBuffer(jsonPayload))
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+consumeSecret)

	client := &http.Client{}
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	// Check if the job was executed successfully
	require.Equal(t, "resolution", result["resultType"])
	require.Equal(t, "success", result["status"])
	require.Equal(t, "Received: Hello, SQS!", result["result"])
}

func TestServiceStartAndReceiveFailingMessage(t *testing.T) {
	machineSecret, consumeSecret, clusterId, apiEndpoint := util.GetTestVars()

	machineID := "random-machine-id"

	// Create a new Inferable instance
	i, err := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   machineSecret,
		MachineID:   machineID,
	})
	require.NoError(t, err)

	// Register a test function
	type TestInput struct {
		Message string `json:"message"`
	}

	// Purposfuly failing function
	testFailingFunc := func(input TestInput, ctx ContextInput) (*string, error) { return nil, fmt.Errorf("test error") }

	err = i.Tools.Register(Tool{
		Func:        testFailingFunc,
		Name:        "FailingFunc",
		Description: "Test function",
	})
	require.NoError(t, err)

	// Start the service
	err = i.Tools.Listen()
	require.NoError(t, err)

	// Ensure the service is stopped at the end of the test
	defer i.Tools.Unlisten()

	// Use executeJobSync to invoke the function
	testMessage := "Hello, SQS!"
	executeCallUrl := fmt.Sprintf("%s/clusters/%s/jobs?waitTime=20", apiEndpoint, clusterId)
	payload := map[string]interface{}{
		"service":  "TestServiceFail",
		"function": "FailingFunc",
		"input": map[string]string{
			"message": testMessage,
		},
	}

	jsonPayload, err := json.Marshal(payload)
	require.NoError(t, err)

	req, err := http.NewRequest("POST", executeCallUrl, bytes.NewBuffer(jsonPayload))
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+consumeSecret)

	client := &http.Client{}
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	// Check if the job was executed successfully
	require.Equal(t, "rejection", result["resultType"])
	require.Equal(t, "success", result["status"])
	require.Equal(t, "test error", result["result"])
}
