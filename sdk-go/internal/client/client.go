package client

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
)

// Client represents an Inferable API client
type Client struct {
	endpoint   string
	secret     string
	httpClient *http.Client
}

type ClientOptions struct {
	Endpoint string
	Secret   string
}

// NewClient creates a new Inferable API client
func NewClient(options ClientOptions) (*Client, error) {
	if !strings.HasPrefix(options.Endpoint, "http://") && !strings.HasPrefix(options.Endpoint, "https://") {
		return nil, fmt.Errorf("invalid URL: %s", options.Endpoint)
	}

	return &Client{
		endpoint:   options.Endpoint,
		secret:     options.Secret,
		httpClient: &http.Client{},
	}, nil
}

type FetchDataOptions struct {
	Path        string
	Headers     map[string]string
	QueryParams map[string]string
	Body        string
	Method      string
}

func (c *Client) FetchData(options FetchDataOptions) (string, http.Header, error, int) {
	fullURL := fmt.Sprintf("%s%s", c.endpoint, options.Path)

	if !strings.HasPrefix(fullURL, "http://") && !strings.HasPrefix(fullURL, "https://") {
		return "", nil, fmt.Errorf("invalid URL: %s", fullURL), -1
	}

	req, err := http.NewRequest(options.Method, fullURL, strings.NewReader(options.Body))
	if err != nil {
		return "", nil, fmt.Errorf("error creating request: %v", err), -1
	}

	req.Header.Set("Authorization", "Bearer "+c.secret)

	// Add custom headers
	for key, value := range options.Headers {
		req.Header.Set(key, value)
	}

	// Add query parameters
	q := req.URL.Query()
	for key, value := range options.QueryParams {
		q.Add(key, value)
	}
	req.URL.RawQuery = q.Encode()

	// Set Content-Type header if body is not empty
	if options.Body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if resp == nil {
			return "", nil, fmt.Errorf("error making request: %v", err), -1
		}
		return "", nil, fmt.Errorf("error making request: %v", err), resp.StatusCode
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("error reading response: %v", err), resp.StatusCode
	}

	if resp.StatusCode >= 400 {
		return "", resp.Header, fmt.Errorf("API error: %s (status code: %d)", string(body), resp.StatusCode), resp.StatusCode
	}

	return string(body), resp.Header, nil, resp.StatusCode
}
