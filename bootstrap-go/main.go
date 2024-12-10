package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	inferable "github.com/inferablehq/inferable/sdk-go"
	"github.com/joho/godotenv"
)

type ExecOutput struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	Error  string `json:"error"`
}

func Exec(input struct {
	Command string `json:"command"`
	Arg     string `json:"arg"`
}) ExecOutput {
	allowedCommands := map[string]bool{
		"ls":  true,
		"cat": true,
	}
	if !allowedCommands[input.Command] {
		return ExecOutput{
			Error: fmt.Sprintf("command not allowed: %s. Allowed commands: %v", input.Command, allowedCommands),
		}
	}

	// Only allow access to files starting with ./
	if !strings.HasPrefix(input.Arg, "./") {
		return ExecOutput{
			Error: "requires arg starting with './'. Example: 'ls ./'",
		}
	}

	cmd := exec.Command(input.Command, input.Arg)
	stdout, err := cmd.Output()
	if err != nil {
		var stderr string
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
		return ExecOutput{
			Stdout: "",
			Stderr: stderr,
			Error:  fmt.Sprintf("command failed: %s", input.Command),
		}
	}

	return ExecOutput{
		Stdout: strings.TrimSpace(string(stdout)),
		Stderr: "",
	}
}

func main() {
	// Load vars from .env file
	err := godotenv.Load()
	if err != nil {
		panic(err)
	}

	// Instantiate the Inferable client
	client, err := inferable.New(inferable.InferableOptions{
		APISecret:   os.Getenv("INFERABLE_API_SECRET"),
		APIEndpoint: os.Getenv("INFERABLE_API_ENDPOINT"),
	})

	if err != nil {
		panic(err)
	}

	// Register the exec function
	_, err = client.Default.RegisterFunc(inferable.Function{
		Func:        Exec,
		Name:        "exec",
		Description: "Executes a system command",
	})
	if err != nil {
		panic(err)
	}

	err = client.Default.Start()
	if err != nil {
		panic(err)
	}

	fmt.Println("Inferable service started")
	fmt.Println("Press CTRL+C to stop")

	// Wait for CTRL+C
	<-make(chan struct{})
}
