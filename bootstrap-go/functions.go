package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
)

func GetUrlContent(input struct {
	URL string `json:"url"`
}) (interface{}, error) {
	resp, err := http.Get(input.URL)
	if err != nil {
		return map[string]interface{}{
			"supervisor": "If the error is retryable, try again. If not, tell the user why this failed.",
			"message":    fmt.Sprintf("Failed to fetch %s: %v", input.URL, err),
			"response":   nil,
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return map[string]interface{}{
			"supervisor": "If the error is retryable, try again. If not, tell the user why this failed.",
			"message":    fmt.Sprintf("Failed to fetch %s: %s", input.URL, resp.Status),
			"response":   resp,
		}, nil
	}

	html, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	cleaned := removeHTMLTags(string(html))

	return map[string]interface{}{
		"body": cleaned,
	}, nil
}

func ScoreHNPost(input struct {
	CommentCount int `json:"commentCount"`
	Upvotes      int `json:"upvotes"`
}) (interface{}, error) {
	score := input.Upvotes + input.CommentCount*2
	return score, nil
}

func GeneratePage(input struct {
	Markdown string `json:"markdown"`
}) (interface{}, error) {
	html := fmt.Sprintf(`
	<html>
		<head>
			<title>Hacker News Page Generated by Inferable</title>
			<script src="https://unpkg.com/showdown/dist/showdown.min.js"></script>
		</head>
		<body>
			<div id="content">%s</div>
			<script>
				const converter = new showdown.Converter();
				document.getElementById("content").innerHTML = converter.makeHtml(document.getElementById("content").innerHTML);
			</script>
		</body>
	</html>
	`, input.Markdown)

	tmpDir := os.TempDir()
	tmpPath := path.Join(tmpDir, "inferable-hacker-news.html")

	err := os.WriteFile(tmpPath, []byte(html), 0644)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"message": "Tell the user to open the file at tmpPath in their browser.",
		"tmpPath": tmpPath,
	}, nil
}

// Helper function to remove HTML tags except for <a> tags
func removeHTMLTags(html string) string {
	parts := strings.Split(html, "<")
	result := []string{parts[0]}

	for _, part := range parts[1:] {
		if strings.HasPrefix(part, "a ") || strings.HasPrefix(part, "/a>") || strings.HasPrefix(part, "a>") {
			result = append(result, "<"+part)
		} else {
			if idx := strings.Index(part, ">"); idx != -1 {
				result = append(result, part[idx+1:])
			}
		}
	}

	return strings.Join(result, "")
}
