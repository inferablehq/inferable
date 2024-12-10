package main

import (
	"encoding/json"
	"fmt"
	"os"

	inferable "github.com/inferablehq/inferable/sdk-go"
	"github.com/joho/godotenv"
)

type Report struct {
	Name         string   `json:"name"`
	Capabilities []string `json:"capabilities"`
}

func main() {
	if err := godotenv.Load(); err != nil {
		fmt.Printf("Warning: Error loading .env file: %v\n", err)
	}

	client, err := inferable.New(inferable.InferableOptions{
		APISecret:   os.Getenv("INFERABLE_API_SECRET"),
		APIEndpoint: os.Getenv("INFERABLE_API_ENDPOINT"),
	})
	if err != nil {
		panic(err)
	}

	// Define the schema for the report
	reportSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name": map[string]string{"type": "string"},
			"capabilities": map[string]interface{}{
				"type":        "array",
				"items":       map[string]string{"type": "string"},
				"description": "The capabilities of the program. What it can do.",
			},
		},
	}

	// Create and execute the run
	run, err := client.CreateRun(inferable.CreateRunInput{
		InitialPrompt: `Iteratively inspect the source code at the current directory, and produce a report.
		You may selectively inspect the contents of files. You can only access files starting with "./"`,
		ResultSchema: reportSchema,
	})
	if err != nil {
		panic(err)
	}

	result, err := run.Poll(nil)
	if err != nil {
		panic(err)
	}

	var report Report
	resultBytes, err := json.Marshal(result.Result)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal result: %v", err))
	}
	if err := json.Unmarshal(resultBytes, &report); err != nil {
		panic(err)
	}

	fmt.Printf("%+v\n", report)
}
