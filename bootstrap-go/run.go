package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"

	inferable "github.com/inferablehq/inferable/sdk-go"
)

type Post struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Points      string `json:"points"`
	CommentsURL string `json:"commentsUrl"`
}

type ExtractResult struct {
	Posts []Post `json:"posts"`
}

type KeyPoint struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	KeyPoints []string `json:"keyPoints"`
}

type GeneratePageResult struct {
	PagePath string `json:"pagePath"`
}

func RunHNExtraction() error {
	client, err := inferable.New(inferable.InferableOptions{
		APISecret:   os.Getenv("INFERABLE_API_SECRET"),
		APIEndpoint: os.Getenv("INFERABLE_API_ENDPOINT"),
		ClusterID:   os.Getenv("INFERABLE_CLUSTER_ID"),
	})
	if err != nil {
		return err
	}

	// Extract top posts
	extractRun, err := client.CreateRun(inferable.CreateRunInput{
		Message: `
		Hacker News has a homepage at https://news.ycombinator.com/
		Each post has a id, title, a link, and a score, and is voted on by users.
		Score the top 10 posts and pick the top 3 according to the internal scoring function.
		`,
	})
	if err != nil {
		return err
	}

	extractResult, err := extractRun.Poll(nil)
	if err != nil {
		return err
	}

	var posts ExtractResult
	resultBytes, ok := extractResult.Result.([]byte)
	if !ok {
		return fmt.Errorf("failed to convert extract result to []byte")
	}
	if err := json.Unmarshal(resultBytes, &posts); err != nil {
		return err
	}

	// Summarize each post
	var summaries []KeyPoint
	for _, post := range posts.Posts {
		summarizeRun, err := client.CreateRun(inferable.CreateRunInput{
			Message: fmt.Sprintf(`
			<data>
				%s
			</data>

			You are given a post from Hacker News, and a url for the post's comments.
			Summarize the comments. You should visit the comments URL to get the comments.
			Produce a list of the key points from the comments.
			`, post),
		})
		if err != nil {
			return err
		}

		summarizeResult, err := summarizeRun.Poll(nil)
		if err != nil {
			return err
		}

		var summary KeyPoint
		resultBytes, ok := summarizeResult.Result.([]byte)
		if !ok {
			return fmt.Errorf("failed to convert summarize result to []byte")
		}
		if err := json.Unmarshal(resultBytes, &summary); err != nil {
			return err
		}
		summaries = append(summaries, summary)
	}

	// Generate final page
	generateRun, err := client.CreateRun(inferable.CreateRunInput{
		Message: fmt.Sprintf(`
		<data>
			%s
		</data>

		You are given a list of posts from Hacker News, and a summary of the comments for each post.

		Generate a web page with the following structure:
		- A header with the title of the page
		- A list of posts, with the title, a link to the post, and the key points from the comments in a ul
		- A footer with a link to the original Hacker News page
		`, summaries),
	})
	if err != nil {
		return err
	}

	generateResult, err := generateRun.Poll(nil)
	if err != nil {
		return err
	}

	var pageResult GeneratePageResult
	resultBytes, ok = generateResult.Result.([]byte)
	if !ok {
		return fmt.Errorf("failed to convert generate result to []byte")
	}
	if err := json.Unmarshal(resultBytes, &pageResult); err != nil {
		return err
	}

	fmt.Printf("Generated page: %+v\n", pageResult)

	// Open browser
	cmd := exec.Command("open", fmt.Sprintf("https://app.inferable.ai/clusters/%s/runs", os.Getenv("INFERABLE_CLUSTER_ID")))
	if err := cmd.Run(); err != nil {
		fmt.Printf("Failed to open browser: %v\n", err)
	}

	return nil
}
