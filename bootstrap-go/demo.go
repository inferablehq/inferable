package main

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// Inventory Item structure
type InventoryItem struct {
	ID          string
	Name        string
	Description string
	Price       float64
	Qty         int
}

// Order structure
type Order struct {
	Item InventoryItem
	Qty  int
	At   time.Time
}

// SearchQuery struct for searching the inventory
type SearchQuery struct {
	Keyword string
}

// OrderRequest struct for creating an order
type OrderRequest struct {
	InventoryItems []struct {
		ID          string
		Name        string
		Description string
		Price       float64
		Qty         int
	} `json:"inventory_items"`
}

// InventoryQuery struct for requesting an inventory item by ID
type InventoryQuery struct {
	ID string
}

// Mock inventory data
var inventory = []InventoryItem{
	{"1", "Sonic Screwdriver", "The Doctor's trusty tool", 100, 10},
	{"2", "Towel", "Don't panic!", 42, 5},
	{"3", "Lightsaber", "An elegant weapon for a more civilized age", 200, 3},
	{"4", "Ring of Power", "One ring to rule them all", 1000, 1},
	{"5", "Hoverboard", "Great Scott!", 500, 2},
}

// Orders slice
var orders []Order

// Search inventory function
func SearchInventory(query SearchQuery) []InventoryItem {
	var results []InventoryItem
	for _, item := range inventory {
		if strings.Contains(strings.ToLower(item.Name), strings.ToLower(query.Keyword)) ||
			strings.Contains(strings.ToLower(item.Description), strings.ToLower(query.Keyword)) {
			results = append(results, item)
		}
	}
	return results
}

// Get inventory item by ID
func GetInventoryItem(query InventoryQuery) (*InventoryItem, error) {
	for _, item := range inventory {
		if item.ID == query.ID {
			return &item, nil
		}
	}
	return nil, errors.New("item not found")
}

// Make an order function
func MakeOrder(orderRequest OrderRequest) ([]Order, error) {
	var newOrders []Order

	for _, orderItem := range orderRequest.InventoryItems {
		// Check if the inventory item is available
		inventoryItem, err := GetInventoryItem(InventoryQuery{ID: orderItem.ID})
		if err != nil {
			return nil, err
		}

		// Check stock availability
		if inventoryItem.Qty < orderItem.Qty {
			return nil, fmt.Errorf("not enough stock for item %s. Only %d left", inventoryItem.Name, inventoryItem.Qty)
		}

		// Create new order
		newOrders = append(newOrders, Order{
			Item: *inventoryItem,
			Qty:  orderItem.Qty,
			At:   time.Now(),
		})

		// Reduce stock
		inventoryItem.Qty -= orderItem.Qty
	}

	// Append the new orders to the orders slice
	orders = append(orders, newOrders...)
	return newOrders, nil
}

// Empty struc
type Empty struct{}

// List orders function
func ListOrders(input Empty) []Order {
	return orders
}

// Total order value function
func TotalOrderValue(input Empty) (float64, error) {
	var total float64
	for _, order := range orders {
		item, err := GetInventoryItem(InventoryQuery{ID: order.Item.ID})
		if err != nil {
			return 0, err
		}
		total += item.Price * float64(order.Qty)
	}
	return total, nil
}
