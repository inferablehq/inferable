package main

import (
	"fmt"
	"os"

	inferable "github.com/inferablehq/inferable/sdk-go"
	"github.com/joho/godotenv"
)

func main() {
	// Load vars from .env file
	err := godotenv.Load()
	if err != nil {
		panic(err)
	}

	// Instantiate the Inferable client.
	client, err := inferable.New(inferable.InferableOptions{
		// To get a new key, run:
		// npx @inferable/cli auth keys create 'My New Machine Key' --type='cluster_machine'
		APISecret:   os.Getenv("INFERABLE_API_SECRET"),
		APIEndpoint: os.Getenv("INFERABLE_API_ENDPOINT"),
		ClusterID:   os.Getenv("INFERABLE_CLUSTER_ID"),
	})

	if err != nil {
		panic(err)
	}

	// Register functions that match the Node.js implementation
	_, err = client.Default.RegisterFunc(inferable.Function{
		Func:        GetUrlContent,
		Name:        "getUrlContent",
		Description: "Gets the content of a URL",
	})
	if err != nil {
		panic(err)
	}

	_, err = client.Default.RegisterFunc(inferable.Function{
		Func:        GeneratePage,
		Name:        "generatePage",
		Description: "Generates a page from markdown",
	})
	if err != nil {
		panic(err)
	}

	_, err = client.Default.RegisterFunc(inferable.Function{
		Func:        ScoreHNPost,
		Name:        "scoreHNPost",
		Description: "Calculates a score for a Hacker News post given its comment count and upvotes",
	})
	if err != nil {
		panic(err)
	}

	err = client.Default.Start()
	if err != nil {
		panic(err)
	}

	fmt.Println("Inferable demo service started")

	// Wait for CTRL+C
	<-make(chan struct{})
}
