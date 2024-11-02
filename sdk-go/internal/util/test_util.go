package util

import (
	"os"

	"github.com/joho/godotenv"
)

func GetTestVars() (string, string, string, string) {
	if os.Getenv("INFERABLE_TEST_API_ENDPOINT") == "" {
		err := godotenv.Load("./.env")
		if err != nil {
			panic(err)
		}
	}
	machineSecret := os.Getenv("INFERABLE_TEST_API_SECRET")
	clusterId := os.Getenv("INFERABLE_TEST_CLUSTER_ID")
	apiEndpoint := os.Getenv("INFERABLE_TEST_API_ENDPOINT")

	if apiEndpoint == "" {
		panic("INFERABLE_TEST_API_ENDPOINT is not available")
	}
	if machineSecret == "" {
		panic("INFERABLE_TEST_API_SECRET is not available")
	}
	if clusterId == "" {
		panic("INFERABLE_TEST_CLUSTER_ID is not set in .env")
	}

	return machineSecret, machineSecret, clusterId, apiEndpoint
}
