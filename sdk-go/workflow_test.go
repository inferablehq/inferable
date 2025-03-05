package inferable

import (
	"fmt"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"
)

// Global random source for test randomization
var rnd = rand.New(rand.NewSource(time.Now().UnixNano()))

// TestWorkflow tests the workflow functionality
func TestWorkflow(t *testing.T) {
	inferable, err := New(InferableOptions{
		APISecret:   getEnvOrSkip(t, "INFERABLE_TEST_API_SECRET"),
		APIEndpoint: getEnvOrSkip(t, "INFERABLE_TEST_API_ENDPOINT"),
	})
	if err != nil {
		t.Fatalf("Failed to create Inferable instances: %v", err)
	}

	// Create a unique workflow name to prevent conflicts with other tests
	workflowName := fmt.Sprintf("go-haystack-%s", randomString(10))

	// Track function calls
	var onStartCalled bool
	var onAgentResultCalled bool
	var onSimpleResultCalled bool
	var toolCallCount int
	var toolCallInputs []string

	// Create a workflow
	workflow := inferable.Workflows.Create(WorkflowConfig{
		Name: workflowName,
		InputSchema: struct {
			ExecutionId    string `json:"executionId"`
			SomeOtherInput string `json:"someOtherInput"`
		}{},
	})

	// Register a tool for the workflow
	workflow.Tools.Register(WorkflowTool{
		Name: "searchHaystack",
		InputSchema: struct {
			SearchQuery string `json:"searchQuery"`
		}{},
		Func: func(input struct {
			SearchQuery string `json:"searchQuery"`
		}, ctx ContextInput) (struct {
			Word string `json:"word"`
		}, error) {
			toolCallCount++
			toolCallInputs = append(toolCallInputs, input.SearchQuery)

			result := struct {
				Word string `json:"word"`
			}{}

			if input.SearchQuery == "marco" {
				result.Word = "needle"
			} else if input.SearchQuery == "marco 42" {
				result.Word = "needle"
			} else {
				result.Word = fmt.Sprintf("not-found-%s", input.SearchQuery)
			}

			return result, nil
		},
	})

	// Define the workflow handler
	workflow.Version(1).Define(func(ctx WorkflowContext, input struct {
		ExecutionId    string `json:"executionId"`
		SomeOtherInput string `json:"someOtherInput"`
	}) (interface{}, error) {
		onStartCalled = true

		// Log a message
		ctx.Log("info", map[string]interface{}{
			"message": "Starting workflows",
		})

		// Use the agent to find the needle
		result, interrupt, err := ctx.Agents.React(ReactAgentConfig{
			Name: "search",
			Instructions: Helpers.StructuredPrompt(struct {
				Facts []string
				Goals []string
			}{
				Facts: []string{"You are haystack searcher"},
				Goals: []string{"Find the special word in the haystack. Only search for the words asked explictly by the user."},
			}),
			Schema: struct {
				Word string `json:"word"`
			}{},
			Tools: []string{"searchHaystack"},
			Input: "Try the searchQuery 'marco'.",
		})

		if err != nil {
			return nil, err
		}

		if interrupt != nil {
			return interrupt, nil
		}

		resultMap, ok := result.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected result type: %T", result)
		}

		word, ok := resultMap["word"].(string)
		if !ok {
			return nil, fmt.Errorf("unexpected word type: %T", resultMap["word"])
		}

		if word != "needle" {
			return nil, fmt.Errorf("expected word to be 'needle', got '%s'", word)
		}

		// Cache a result
		cachedResult, err := ctx.Memo("testResultCall", func() (interface{}, error) {
			return map[string]interface{}{
				"word": "needle",
			}, nil
		})

		if err != nil {
			return nil, err
		}

		cachedResultMap, ok := cachedResult.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected cached result type: %T", cachedResult)
		}

		cachedWord, ok := cachedResultMap["word"].(string)
		if !ok {
			return nil, fmt.Errorf("unexpected cached word type: %T", cachedResultMap["word"])
		}

		if cachedWord != "needle" {
			return nil, fmt.Errorf("expected cached word to be 'needle', got '%s'", cachedWord)
		}

		onAgentResultCalled = true

		// Log a message
		ctx.Log("info", map[string]interface{}{
			"message": "About to run simple LLM call",
		})

		// Use the LLM to generate structured output
		simpleResult, err := ctx.LLM.Structured(StructuredInput{
			Input: "Return the word, needle.",
			Schema: struct {
				Word string `json:"word"`
			}{},
		})

		if err != nil {
			return nil, err
		}

		simpleResultMap, ok := simpleResult.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected simple result type: %T", simpleResult)
		}

		simpleWord, ok := simpleResultMap["word"].(string)
		if !ok {
			return nil, fmt.Errorf("unexpected simple word type: %T", simpleResultMap["word"])
		}

		if simpleWord != "needle" {
			return nil, fmt.Errorf("expected simple word to be 'needle', got '%s'", simpleWord)
		}

		onSimpleResultCalled = true

		return map[string]interface{}{
			"word": "needle",
		}, nil
	})

	// Start listening for workflow executions
	err = workflow.Listen()
	if err != nil {
		t.Fatalf("Failed to start workflow listeners: %v", err)
	}
	defer workflow.Unlisten()

	executionId := randomString(10)

	// Trigger the workflow
	err = inferable.Workflows.Trigger(workflowName, executionId, map[string]interface{}{
		"someOtherInput": "foo",
	})
	if err != nil {
		t.Fatalf("Failed to trigger workflow: %v", err)
	}

	// Wait for the workflow to complete
	start := time.Now()
	timeout := 120 * time.Second // Increase timeout to 2 minutes
	checkInterval := 500 * time.Millisecond

	t.Logf("Waiting for workflow to complete (timeout: %v)...", timeout)

	for !onSimpleResultCalled && time.Since(start) < timeout {
		if time.Since(start) > 10*time.Second && time.Since(start)%(10*time.Second) < checkInterval {
			t.Logf("Still waiting for workflow completion... (elapsed: %v, onStartCalled: %v, onAgentResultCalled: %v, toolCallCount: %d)",
				time.Since(start).Round(time.Second), onStartCalled, onAgentResultCalled, toolCallCount)
		}
		time.Sleep(checkInterval)
	}

	t.Logf("Wait completed. Workflow completion status: %v (elapsed: %v)", onSimpleResultCalled, time.Since(start).Round(time.Second))

	// Check that the workflow was called with the correct input
	if !onStartCalled {
		t.Errorf("Workflow was not called")
	}

	// Check that the agent found the needle
	if !onAgentResultCalled {
		t.Errorf("Agent did not find the needle")
	}

	// Check that the tool was called the correct number of times
	if toolCallCount != 1 {
		t.Errorf("Expected tool to be called 1 times, got %d", toolCallCount)
	}

	// Check that the simple LLM call was made
	if !onSimpleResultCalled {
		t.Errorf("Simple LLM call was not made")
	}
}

// Helper function to get an environment variable or skip the test
func getEnvOrSkip(t *testing.T, name string) string {
	t.Helper()

	// Try to load .env file if the environment variable is not set
	if os.Getenv(name) == "" {
		_ = godotenv.Load("./.env")
	}

	value := os.Getenv(name)
	if value == "" {
		t.Skipf("Environment variable %s not set", name)
	}
	return value
}

// Helper function to generate a random string
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[rnd.Intn(len(charset))]
	}
	return string(result)
}
