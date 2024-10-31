package main

import (
  "os"

  "github.com/inferablehq/inferable-go"
  "github.com/joho/godotenv"
)

func main() {
  // Load vars from .env file
  err := godotenv.Load()
  if err != nil {
    panic(err)
  }

  // Instantiate the Inferable client.
  i, err := inferable.New(inferable.InferableOptions{
    // To get a new key, run:
    // npx @inferable/cli auth keys create 'My New Machine Key' --type='cluster_machine'
    APISecret:   os.Getenv("INFERABLE_API_SECRET"),
    APIEndpoint: os.Getenv("INFERABLE_API_ENDPOINT"),
  })

  if err != nil {
    panic(err)
  }

  // Register demo functions (Defined in ./src/demo.go)
  err = i.Default.RegisterFunc(inferable.Function{
    Func:        SearchInventory,
    Name:        "searchInventory",
    Description: "Searches the inventory",
  })
  if err != nil {
    panic(err)
  }

  err = i.Default.RegisterFunc(inferable.Function{
    Func:        GetInventoryItem,
    Name:        "getInventoryItem",
    Description: "Gets an inventory item",
  })
  if err != nil {
    panic(err)
  }

  err = i.Default.RegisterFunc(inferable.Function{
    Func:        ListOrders,
    Name:        "listOrders",
    Description: "Lists all orders",
  })
  if err != nil {
    panic(err)
  }

  err = i.Default.RegisterFunc(inferable.Function{
    Func:        TotalOrderValue,
    Name:        "totalOrderValue",
    Description: "Calculates the total value of all orders",
  })
  if err != nil {
    panic(err)
  }

  type OrderConfig struct {
    RequiresApproval bool
  }

  err = i.Default.RegisterFunc(inferable.Function{
    Func:        MakeOrder,
    Name:        "makeOrder",
    Description: "Makes an order",
    Config:       OrderConfig{RequiresApproval: true},
  })
  if err != nil {
    panic(err)
  }

  err = i.Default.Start()
  if err != nil {
    panic(err)
  }

  defer i.Default.Stop()

  // Wait for CTRL+C
  <-make(chan struct{})
}
