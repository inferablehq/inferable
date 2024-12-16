package inferable

import (
	"fmt"
	"testing"
	"time"

	"github.com/inferablehq/inferable/sdk-go/internal/util"
)

type EchoInput struct {
	Input string
}

func echo(input EchoInput) string {
	return input.Input
}

type ReverseInput struct {
	Input string
}

func reverse(input ReverseInput) string {
	runes := []rune(input.Input)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes)
}

func TestInferableFunctions(t *testing.T) {
	machineSecret, _, _, apiEndpoint := util.GetTestVars()

	inferableInstance, err := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   machineSecret,
	})
	if err != nil {
		t.Fatalf("Error creating Inferable instance: %v", err)
	}

	service, err := inferableInstance.RegisterService("string_operations")
	if err != nil {
		t.Fatalf("Error registering service: %v", err)
	}

	_, err = service.RegisterFunc(Function{
		Func:        echo,
		Description: "Echoes the input string",
		Name:        "echo",
	})
	if err != nil {
		t.Fatalf("Error registering echo function: %v", err)
	}

	_, err = service.RegisterFunc(Function{
		Func:        reverse,
		Description: "Reverses the input string",
		Name:        "reverse",
	})
	if err != nil {
		t.Fatalf("Error registering reverse function: %v", err)
	}

	if err != nil {
		t.Fatalf("Error generating JSON definition: %v", err)
	}
	t.Run("Echo Function", func(t *testing.T) {
		testInput := EchoInput{Input: "Hello, Inferable!"}
		result, err := inferableInstance.callFunc("string_operations", "echo", testInput)
		if err != nil {
			t.Fatalf("Error calling echo function: %v", err)
		}

		if len(result) != 1 {
			t.Fatalf("Expected 1 return value, got %d", len(result))
		}

		returnedString := result[0].Interface().(string)
		if returnedString != testInput.Input {
			t.Errorf("Echo function returned incorrect result. Expected: %s, Got: %s", testInput.Input, returnedString)
		}
	})

	t.Run("Reverse Function", func(t *testing.T) {
		testInput := ReverseInput{Input: "Hello, Inferable!"}
		result, err := inferableInstance.callFunc("string_operations", "reverse", testInput)
		if err != nil {
			t.Fatalf("Error calling reverse function: %v", err)
		}

		if len(result) != 1 {
			t.Fatalf("Expected 1 return value, got %d", len(result))
		}

		returnedString := result[0].Interface().(string)
		if returnedString != "!elbarefnI ,olleH" {
			t.Errorf("Reverse function returned incorrect result. Expected: %s, Got: %s", testInput.Input, returnedString)
		}
	})

	t.Run("Server Health Check", func(t *testing.T) {
		err := inferableInstance.serverOk()
		if err != nil {
			t.Fatalf("Server health check failed: %v", err)
		}
		t.Log("Server health check passed")
	})

	t.Run("Machine ID Generation", func(t *testing.T) {
		machineID := inferableInstance.machineID
		if machineID == "" {
			t.Error("Machine ID is empty")
		}
		t.Logf("Generated Machine ID: %s", machineID)
	})

	t.Run("Machine ID Consistency", func(t *testing.T) {
		machineSecret, _, _, apiEndpoint := util.GetTestVars()

		instance1, err := New(InferableOptions{
			APIEndpoint: apiEndpoint,
			APISecret:   machineSecret,
		})
		if err != nil {
			t.Fatalf("Error creating first Inferable instance: %v", err)
		}
		id1 := instance1.machineID

		instance2, err := New(InferableOptions{
			APIEndpoint: apiEndpoint,
			APISecret:   machineSecret,
		})
		if err != nil {
			t.Fatalf("Error creating second Inferable instance: %v", err)
		}
		id2 := instance2.machineID

		if id1 != id2 {
			t.Errorf("Machine IDs are not consistent. First: %s, Second: %s", id1, id2)
		} else {
			t.Logf("Machine ID is consistent: %s", id1)
		}
	})
}

// This should match the example in the readme
func TestInferableE2E(t *testing.T) {
	machineSecret, _, _, apiEndpoint := util.GetTestVars()

	client, err := New(InferableOptions{
		APIEndpoint: apiEndpoint,
		APISecret:   machineSecret,
	})

	if err != nil {
		t.Fatalf("Error creating Inferable instance: %v", err)
	}

	didCallSayHello := false
	didCallResultHandler := false

	sayHello, err := client.Default.RegisterFunc(Function{
		Func: func(input EchoInput) string {
			didCallSayHello = true
			return "Hello " + input.Input
		},
		Name:        "SayHello",
		Description: "A simple greeting function",
	})

	if err != nil {
		t.Fatalf("Error registering SayHello function: %v", err)
	}

	resultHandler, err := client.Default.RegisterFunc(Function{
		Func: func(input OnStatusChangeInput) string {
			didCallResultHandler = true
			fmt.Println("OnStatusChange: ", input)
			return ""
		},
		Name: "ResultHandler",
	})

	if err != nil {
		t.Fatalf("Error registering ResultHandler function: %v", err)
	}

	client.Default.Start()

	run, err := client.CreateRun(CreateRunInput{
		InitialPrompt: "Say hello to John Smith",
		AttachedFunctions: []*FunctionReference{
			sayHello,
		},
		OnStatusChange: &OnStatusChange{
			Function: resultHandler,
		},
	})

	if err != nil {
		panic(err)
	}

	fmt.Println("Run started: ", run.ID)
	result, err := run.Poll(nil)
	if err != nil {
		panic(err)
	}
	fmt.Println("Run Result: ", result)

	time.Sleep(1000 * time.Millisecond)

	if result == nil {
		t.Error("Result is nil")
	}

	if !didCallSayHello {
		t.Error("SayHello function was not called")
	}

	if !didCallResultHandler {
		t.Error("OnStatusChange function was not called")
	}
}
