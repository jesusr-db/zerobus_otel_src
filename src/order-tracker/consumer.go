package main

import (
	"context"
	"fmt"
	"time"

	"github.com/IBM/sarama"
	pb "github.com/open-telemetry/opentelemetry-demo/src/order-tracker/genproto/oteldemo"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/protobuf/proto"
)

type tracker struct {
	store  *Store
	tracer trace.Tracer
}

func (t *tracker) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (t *tracker) Cleanup(sarama.ConsumerGroupSession) error { return nil }

func (t *tracker) ConsumeClaim(sess sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		t.handle(msg)
		sess.MarkMessage(msg, "")
	}
	return nil
}

func (t *tracker) handle(msg *sarama.ConsumerMessage) {
	carrier := propagation.MapCarrier{}
	for _, h := range msg.Headers {
		carrier[string(h.Key)] = string(h.Value)
	}
	ctx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)

	var order pb.OrderResult
	if err := proto.Unmarshal(msg.Value, &order); err != nil {
		return
	}

	channel := "delivery" // TODO Phase D: derive from order metadata
	storeID := order.GetShippingTrackingId()
	prep := SamplePrepSeconds(channel)
	sched := BuildSchedule(channel, prep, SampleDeliverySeconds())
	st := OrderState{
		OrderID:  order.GetOrderId(),
		StoreID:  storeID,
		Channel:  channel,
		PlacedAt: time.Now().Unix(),
		Schedule: sched,
	}
	_ = t.store.Put(ctx, st)

	addr := order.GetShippingAddress()
	var skus []string
	var totalQty int32
	for _, it := range order.GetItems() {
		ci := it.GetItem()
		skus = append(skus, fmt.Sprintf("%s x%d", ci.GetProductId(), ci.GetQuantity()))
		totalQty += ci.GetQuantity()
	}

	_, span := t.tracer.Start(ctx, "order-tracker received order",
		trace.WithAttributes(
			attribute.String("order.id", st.OrderID),
			attribute.String("order.channel", channel),
			attribute.String("order.store_id", storeID),
			attribute.Int("sos.target_seconds", sched.SosTargetSeconds),
			attribute.Int("order.prep_seconds", prep),
			attribute.Int("order.item_count", len(order.GetItems())),
			attribute.Int("order.total_quantity", int(totalQty)),
			attribute.StringSlice("order.skus", skus),
			attribute.String("order.location.city", addr.GetCity()),
			attribute.String("order.location.state", addr.GetState()),
			attribute.String("order.location.zip", addr.GetZipCode()),
		))
	span.End()

	go t.advance(ctx, st)
}

func (t *tracker) advance(ctx context.Context, st OrderState) {
	start := time.Unix(st.PlacedAt, 0)
	for i, stg := range st.Schedule.Stages {
		until := start.Add(time.Duration(stg.OffsetSeconds) * time.Second)
		if d := time.Until(until); d > 0 {
			time.Sleep(d)
		}
		elapsed := int(time.Now().Unix() - st.PlacedAt)
		breach := elapsed > st.Schedule.SosTargetSeconds
		_, span := t.tracer.Start(ctx, "stage: "+stg.Name,
			trace.WithAttributes(
				attribute.String("order.id", st.OrderID),
				attribute.String("order.stage", stg.Name),
				attribute.Int("order.stage.index", i),
				attribute.Int("order.elapsed_seconds", elapsed),
				attribute.Bool("sos.breach", breach),
			))
		span.End()
		_ = t.store.client.Expire(ctx, key(st.OrderID), 6*time.Hour).Err()
	}
}
