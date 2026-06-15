package main

import (
	"testing"

	"github.com/IBM/sarama"
)

func TestHeaderValue(t *testing.T) {
	hs := []*sarama.RecordHeader{
		{Key: []byte("pizzatel.store_id"), Value: []byte("42")},
		{Key: []byte("traceparent"), Value: []byte("00-abc-def-01")},
	}
	if got := headerValue(hs, "pizzatel.store_id"); got != "42" {
		t.Fatalf("store_id want 42 got %q", got)
	}
	if got := headerValue(hs, "pizzatel.order_type"); got != "" {
		t.Fatalf("absent header want empty got %q", got)
	}
}
