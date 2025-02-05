package inferable

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNew(t *testing.T) {
	i, err := New(InferableOptions{
		APIEndpoint: DefaultAPIEndpoint,
		APISecret:   "test-secret",
	})
	require.NoError(t, err)
	assert.Equal(t, DefaultAPIEndpoint, i.apiEndpoint)
	assert.Equal(t, "test-secret", i.apiSecret)
	assert.NotEmpty(t, i.machineID)
}

func TestCallFunc(t *testing.T) {
	i, _ := New(InferableOptions{
		APIEndpoint: DefaultAPIEndpoint,
		APISecret:   "test-secret",
	})

	type TestInput struct {
		A int `json:"a"`
		B int `json:"b"`
	}

	testFunc := func(input TestInput, ctx ContextInput) int { return input.A + input.B }
	err := i.Tools.RegisterFunc(Tool{
		Func: testFunc,
		Name: "TestFunc",
	})

	assert.NoError(t, err)

	result, err := i.callFunc("TestFunc", TestInput{A: 2, B: 3}, ContextInput{})
	require.NoError(t, err)
	assert.Equal(t, 5, result[0].Interface())

	// Test calling non-existent function
	_, err = i.callFunc("NonExistentFunc")
	assert.Error(t, err)
}

func TestServerOk(t *testing.T) {
	// Create a test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/live" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status": "ok"}`))
		}
	}))
	defer server.Close()

	i, _ := New(InferableOptions{
		APIEndpoint: server.URL,
		APISecret:   "test-secret",
	})
	err := i.serverOk()
	assert.NoError(t, err)
}

func TestGetMachineID(t *testing.T) {
	i, _ := New(InferableOptions{
		APIEndpoint: DefaultAPIEndpoint,
		APISecret:   "test-secret",
	})
	machineID := i.machineID
	assert.NotEmpty(t, machineID)

	// Check if the machine ID is persistent
	i2, _ := New(InferableOptions{
		APIEndpoint: DefaultAPIEndpoint,
		APISecret:   "test-secret",
	})
	assert.Equal(t, machineID, i2.machineID)
}
