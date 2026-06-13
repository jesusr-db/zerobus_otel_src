package main

import (
	"context"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func main() {
	ctx := context.Background()
	exp, err := otlptracegrpc.New(ctx)
	if err != nil {
		panic(err)
	}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exp))
	defer func() { _ = tp.Shutdown(ctx) }()
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	brokers := strings.Split(os.Getenv("KAFKA_ADDR"), ",")
	store := NewStore(os.Getenv("VALKEY_ADDR"))
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V3_0_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	group, err := sarama.NewConsumerGroup(brokers, "order-tracker", cfg)
	if err != nil {
		panic(err)
	}
	defer func() { _ = group.Close() }()

	t := &tracker{store: store, tracer: otel.Tracer("order-tracker")}
	sigterm := make(chan os.Signal, 1)
	signal.Notify(sigterm, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		for {
			if err := group.Consume(ctx, []string{"orders"}, t); err != nil {
				return
			}
		}
	}()
	<-sigterm
}
