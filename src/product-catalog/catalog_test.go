package main

import "testing"

// readProductFiles() is defined in main.go; it loads ./products/*.json into []*pb.Product.
func TestCatalogLoadsPizzaMenu(t *testing.T) {
	products, err := readProductFiles()
	if err != nil {
		t.Fatalf("readProductFiles returned error: %v", err)
	}
	if len(products) == 0 {
		t.Fatal("expected a non-empty pizza menu, got 0 products")
	}
	hasPizza := false
	for _, p := range products {
		for _, c := range p.Categories {
			if c == "pizza" {
				hasPizza = true
			}
		}
		if p.PriceUsd == nil {
			t.Fatalf("product %q has nil PriceUsd", p.Id)
		}
	}
	if !hasPizza {
		t.Fatal("expected at least one product in category 'pizza'")
	}
}
