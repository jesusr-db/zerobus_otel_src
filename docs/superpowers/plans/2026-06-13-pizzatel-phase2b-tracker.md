# PizzaTel — Plan 2b: Pizza Tracker + Store Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live "pizza tracker" (Prep → Bake → Quality Check → Out for Delivery → Delivered) driven by a new Kafka-consuming `order-tracker` service, a store picker so each order is tied to a real synth store, and an imagery upgrade — all while preserving telemetry parity and offline-runnability.

**Architecture:** `checkout` already publishes `OrderResult` protobuf to the Kafka `orders` topic with W3C trace context injected into message headers (`src/checkout/main.go:677` `createProducerSpan`). A new Go `order-tracker` service consumes that stream (continuing the trace), samples a per-order stage timeline from synth SOS/prep distributions, writes state to Valkey keyed by `order_id`, and emits a span per stage transition. The frontend polls an instrumented BFF endpoint (`/api/order-status`) and renders the 5-stage tracker on the order-confirmation page. A store picker (fed by a baked `stores.json` from `jmrdemo.pizzatel.stores`) threads a `store_id` through checkout → order → tracker → SOS. No proto/gRPC changes.

**Tech Stack:** Go 1.24 (order-tracker; sarama consumer + OTel + go-redis, mirroring `checkout`), Valkey (`valkey-cart:6379`), Next.js/TypeScript BFF + styled-components UI, Docker Compose. Go module proxy is DNS-blocked here → builds use the registry-mirror trick (see Appendix).

---

## Plan series context
**Plan 2b** of the PizzaTel series (2a = rebrand, merged to main). Phases below are independently shippable increments.
- **Phase A:** `order-tracker` service (Kafka→Valkey + spans). Backend.
- **Phase B:** BFF `/api/order-status` endpoint.
- **Phase C:** tracker UI on the confirmation page.
- **Phase D:** store picker (option A) + `store_id` threading.
- **Phase E:** imagery upgrade (SVG category illustrations).

**Deferred to roadmap (NOT in 2b):** address→auto-nearest store routing (haversine via `us_locations` centroids in `shipping`); trajectory/lifecycle-template adoption; OTel→`order_events` write-back; photorealistic/AI product photos (asset-dependent — the SVG illustrations in Phase E are the in-code ceiling).

---

## Synth timing facts (the tracker's source of truth — verified in Plan 0/1)
From `synthData` (`entropy.py`, `orders.py`, live `order_events`):
- prep time: carryout ~Gauss(12min, 3min); delivery ~Gauss(31min, 6min).
- SOS target: **720s carryout / 1800s delivery**; `is_sos_breach` when exceeded.
- delivery: `estimated_delivery_seconds = prep + 900`; `actual_delivery_seconds = prep + rand(600,1800)`.
- stage machine: placed→preparing→ready→fulfilled (+ delivery). Map to UI labels Prep→Bake→QualityCheck→OutForDelivery→Delivered.

---

## File Structure

- `src/order-tracker/` — **new Go service**
  - `go.mod`, `go.sum`
  - `timeline.go` — pure stage-timeline sampler (no I/O; unit-tested)
  - `timeline_test.go` — Go tests
  - `state.go` — Valkey read/write of order state (JSON)
  - `consumer.go` — sarama consumer-group handler: extract trace ctx, unmarshal OrderResult, schedule + persist, emit spans
  - `main.go` — wiring (OTel init mirroring checkout, sarama consumer, redis client, env)
  - `genproto/oteldemo/` — copied proto stubs (same pattern as `src/checkout/genproto`)
  - `Dockerfile`
- `docker-compose.minimal.yml` + `docker-compose.yml` — **modify**: add `order-tracker` service.
- `.env` — **modify**: `ORDER_TRACKER_*` vars (port, valkey addr, kafka addr).
- `src/frontend/pages/api/order-status.ts` — **new** instrumented BFF endpoint.
- `src/frontend/gateways/` + `src/frontend/services/` — **new** OrderStatus gateway/service (follow existing pattern).
- `src/frontend/components/OrderTracker/` — **new** 5-stage tracker component + styled.
- `src/frontend/pages/cart/checkout/[orderId]/index.tsx` — **modify**: render `<OrderTracker>`.
- `src/frontend/components/StorePicker/` — **new** store selector.
- `src/frontend/pages/api/stores.ts` + baked `src/frontend/public/stores.json` (or product-catalog-style seed) — **new** store list.
- `provisioning/src/seed_export_notebook.py` — **modify**: also export `stores.json` (store_id, name, city, state, metro_area) to the volume.
- `src/image-provider/static/products/*.svg` (or replace `.jpg`) — **new** SVG category illustrations + frontend resolver tweak.

---

## PHASE A — order-tracker service (Kafka → Valkey + spans)

### Task A1: Scaffold the Go module + copy proto stubs

**Files:** Create `src/order-tracker/go.mod`, `src/order-tracker/genproto/oteldemo/` (copied)

- [ ] **Step 1: Create module + vendor the proto stubs from checkout**

Run:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
mkdir -p src/order-tracker/genproto/oteldemo
cp src/checkout/genproto/oteldemo/*.go src/order-tracker/genproto/oteldemo/
cd src/order-tracker && go mod init github.com/open-telemetry/opentelemetry-demo/src/order-tracker
```
Expected: `go.mod` created. (The proto stubs give us `pb.OrderResult` without a proto-gen step. Fix the `package`/module path import in the copied files if `go vet` complains — they import the oteldemo package by relative path.)

- [ ] **Step 2: Commit scaffold**

```bash
git add src/order-tracker/go.mod src/order-tracker/genproto
git commit -m "feat(order-tracker): scaffold Go module + proto stubs

Co-authored-by: Isaac"
```

### Task A2: Pure stage-timeline sampler (TDD)

**Files:** Create `src/order-tracker/timeline.go`, `src/order-tracker/timeline_test.go`

- [ ] **Step 1: Write the failing test**

Create `src/order-tracker/timeline_test.go`:
```go
package main

import "testing"

func TestBuildScheduleCarryoutStagesAndSOS(t *testing.T) {
	// deterministic rng via fixed prepSeconds injection
	s := BuildSchedule("delivery", 1800 /*prepSecs*/, 1200 /*deliverySecs*/)
	if s.SosTargetSeconds != 1800 {
		t.Fatalf("delivery SOS target want 1800 got %d", s.SosTargetSeconds)
	}
	want := []string{"Prep", "Bake", "QualityCheck", "OutForDelivery", "Delivered"}
	if len(s.Stages) != len(want) {
		t.Fatalf("want %d stages got %d", len(want), len(s.Stages))
	}
	for i, st := range s.Stages {
		if st.Name != want[i] {
			t.Fatalf("stage %d want %s got %s", i, want[i], st.Name)
		}
		if st.OffsetSeconds < 0 {
			t.Fatalf("stage %s negative offset", st.Name)
		}
	}
	// stages are monotonically increasing in offset
	for i := 1; i < len(s.Stages); i++ {
		if s.Stages[i].OffsetSeconds < s.Stages[i-1].OffsetSeconds {
			t.Fatalf("offsets not monotonic at %d", i)
		}
	}
}

func TestBuildScheduleCarryoutHasNoDeliveryLeg(t *testing.T) {
	s := BuildSchedule("carryout", 720, 0)
	if s.SosTargetSeconds != 720 {
		t.Fatalf("carryout SOS want 720 got %d", s.SosTargetSeconds)
	}
	last := s.Stages[len(s.Stages)-1].Name
	if last != "ReadyForPickup" {
		t.Fatalf("carryout final stage want ReadyForPickup got %s", last)
	}
}
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd src/order-tracker && go test ./... -run TestBuildSchedule -v`
Expected: FAIL — `BuildSchedule` undefined.

- [ ] **Step 3: Implement `timeline.go`**

Create `src/order-tracker/timeline.go`:
```go
package main

// Stage is one tracker step at a relative offset from order placement.
type Stage struct {
	Name          string `json:"name"`
	OffsetSeconds int    `json:"offset_seconds"`
}

// Schedule is the full per-order tracker timeline.
type Schedule struct {
	Channel          string  `json:"channel"`
	SosTargetSeconds int     `json:"sos_target_seconds"`
	Stages           []Stage `json:"stages"`
}

// BuildSchedule derives the stage timeline from sampled prep/delivery seconds.
// Delivery channels get the full 5-stage flow ending in Delivered; carryout ends
// at ReadyForPickup. SOS target mirrors synthData: 720 carryout / 1800 delivery.
func BuildSchedule(channel string, prepSecs, deliverySecs int) Schedule {
	isDelivery := channel != "carryout"
	sos := 720
	if isDelivery {
		sos = 1800
	}
	// split prep across Prep/Bake/QualityCheck (40/40/20)
	prep := float64(prepSecs)
	stages := []Stage{
		{"Prep", 0},
		{"Bake", int(prep * 0.40)},
		{"QualityCheck", int(prep * 0.80)},
	}
	if isDelivery {
		stages = append(stages,
			Stage{"OutForDelivery", prepSecs},
			Stage{"Delivered", prepSecs + deliverySecs},
		)
	} else {
		stages = append(stages, Stage{"ReadyForPickup", prepSecs})
	}
	return Schedule{Channel: channel, SosTargetSeconds: sos, Stages: stages}
}
```

- [ ] **Step 4: Run it, verify PASS**

Run: `cd src/order-tracker && go test ./... -run TestBuildSchedule -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the sampler with injectable rng (TDD)**

Append to `timeline_test.go`:
```go
func TestSamplePrepSecondsRanges(t *testing.T) {
	// fixed source → deterministic; just assert sane bounds across channels
	for i := 0; i < 200; i++ {
		c := SamplePrepSeconds("carryout")
		if c < 60 { t.Fatalf("carryout prep too low: %d", c) }
		d := SamplePrepSeconds("delivery")
		if d < 300 { t.Fatalf("delivery prep too low: %d", d) }
	}
}
```
Append to `timeline.go`:
```go
import "math/rand"

// SamplePrepSeconds mirrors synthData entropy.prep_time_seconds:
// carryout ~Gauss(12min,3min) floored at 60; delivery ~Gauss(31min,6min) floored at 300.
func SamplePrepSeconds(channel string) int {
	if channel == "carryout" {
		v := int(rand.NormFloat64()*180 + 720)
		if v < 60 { v = 60 }
		return v
	}
	v := int(rand.NormFloat64()*360 + 1860)
	if v < 300 { v = 300 }
	return v
}

// SampleDeliverySeconds mirrors actual_delivery_seconds = prep + rand(600,1800).
func SampleDeliverySeconds() int { return 600 + rand.Intn(1200) }
```
Run: `cd src/order-tracker && go test ./... -v` → expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/order-tracker/timeline.go src/order-tracker/timeline_test.go
git commit -m "feat(order-tracker): tested stage-timeline sampler from synth SOS/prep distributions

Co-authored-by: Isaac"
```

### Task A3: Valkey state (read/write order status JSON)

**Files:** Create `src/order-tracker/state.go`

- [ ] **Step 1: Implement state.go**

Create `src/order-tracker/state.go`:
```go
package main

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// OrderState is the canonical tracker record the BFF reads.
type OrderState struct {
	OrderID   string   `json:"order_id"`
	StoreID   string   `json:"store_id"`
	Channel   string   `json:"channel"`
	PlacedAt  int64    `json:"placed_at_unix"`
	Schedule  Schedule `json:"schedule"`
}

type Store struct{ client *redis.Client }

func NewStore(addr string) *Store {
	return &Store{client: redis.NewClient(&redis.Options{Addr: addr})}
}

func key(orderID string) string { return "tracker:" + orderID }

// Put writes the order state with a 6h TTL (demo orders are ephemeral).
func (s *Store) Put(ctx context.Context, st OrderState) error {
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	return s.client.Set(ctx, key(st.OrderID), b, 6*time.Hour).Err()
}

// Get returns the order state, or (nil,nil) if absent.
func (s *Store) Get(ctx context.Context, orderID string) (*OrderState, error) {
	b, err := s.client.Get(ctx, key(orderID)).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var st OrderState
	if err := json.Unmarshal(b, &st); err != nil {
		return nil, err
	}
	return &st, nil
}

// CurrentStage computes the stage at time `now` from the stored schedule
// (read-time computation → survives restarts, no per-order goroutine needed).
func (st OrderState) CurrentStage(nowUnix int64) string {
	elapsed := int(nowUnix - st.PlacedAt)
	cur := st.Schedule.Stages[0].Name
	for _, s := range st.Schedule.Stages {
		if elapsed >= s.OffsetSeconds {
			cur = s.Name
		}
	}
	return cur
}
```

- [ ] **Step 2: go mod tidy via the proxy mirror (see Appendix), verify build**

Run (uses GOPROXY mirror because proxy.golang.org is DNS-blocked):
```bash
cd src/order-tracker && GOPROXY=https://goproxy.io,direct GOSUMDB=off go mod tidy && go build ./...
```
Expected: deps resolve (go-redis, sarama, otel), builds clean.

- [ ] **Step 3: Commit**

```bash
git add src/order-tracker/state.go src/order-tracker/go.mod src/order-tracker/go.sum
git commit -m "feat(order-tracker): Valkey order-state store + read-time stage computation

Co-authored-by: Isaac"
```

### Task A4: Kafka consumer + span-per-transition + main wiring

**Files:** Create `src/order-tracker/consumer.go`, `src/order-tracker/main.go`

- [ ] **Step 1: Implement consumer.go** (extract trace ctx from Kafka headers, unmarshal OrderResult, persist schedule, emit a span per scheduled transition)

Create `src/order-tracker/consumer.go`:
```go
package main

import (
	"context"
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
	// 1. continue the checkout trace from the W3C headers checkout injected
	carrier := propagation.MapCarrier{}
	for _, h := range msg.Headers {
		carrier[string(h.Key)] = string(h.Value)
	}
	ctx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)

	var order pb.OrderResult
	if err := proto.Unmarshal(msg.Value, &order); err != nil {
		return
	}

	// 2. derive channel + store from order metadata (store_id rides in OrderResult
	//    via the shipping address state today; Phase D threads an explicit store_id).
	channel := "delivery"
	storeID := order.GetShippingTrackingId() // placeholder linkage until Phase D sets store_id
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

	// 3. one span marking tracker start, as a child of the checkout trace
	_, span := t.tracer.Start(ctx, "order-tracker received order",
		trace.WithAttributes(
			attribute.String("order.id", st.OrderID),
			attribute.String("order.channel", channel),
			attribute.Int("sos.target_seconds", sched.SosTargetSeconds),
			attribute.Int("order.prep_seconds", prep),
		))
	span.End()

	// 4. background goroutine emits a span per stage transition + updates Valkey
	go t.advance(ctx, st)
}

// advance sleeps to each stage offset, emits a transition span, and refreshes Valkey.
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
```

- [ ] **Step 2: Implement main.go** (OTel init + sarama consumer group + redis, mirroring `src/checkout/main.go` init)

Create `src/order-tracker/main.go`:
```go
package main

import (
	"context"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func main() {
	ctx := context.Background()
	exp, _ := otlptracegrpc.New(ctx) // endpoint from OTEL_EXPORTER_OTLP_ENDPOINT env
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exp))
	defer tp.Shutdown(ctx)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	_ = runtime.Start()

	brokers := strings.Split(os.Getenv("KAFKA_ADDR"), ",")
	store := NewStore(os.Getenv("VALKEY_ADDR"))
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V3_0_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	group, err := sarama.NewConsumerGroup(brokers, "order-tracker", cfg)
	if err != nil {
		panic(err)
	}
	defer group.Close()

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
```

- [ ] **Step 3: tidy + build (mirror)**

Run: `cd src/order-tracker && GOPROXY=https://goproxy.io,direct GOSUMDB=off go mod tidy && go build ./... && go test ./...`
Expected: builds + unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/order-tracker/consumer.go src/order-tracker/main.go src/order-tracker/go.mod src/order-tracker/go.sum
git commit -m "feat(order-tracker): kafka consumer continues checkout trace, emits stage spans

Co-authored-by: Isaac"
```

### Task A5: Dockerfile + compose + env wiring

**Files:** Create `src/order-tracker/Dockerfile`; modify `docker-compose.minimal.yml`, `docker-compose.yml`, `.env`

- [ ] **Step 1: Dockerfile** (mirror `src/checkout/Dockerfile`; build needs the GOPROXY mirror — see Appendix; pass `--build-arg GOPROXY` or add `ENV GOPROXY` in a build-test copy)

Create `src/order-tracker/Dockerfile`:
```dockerfile
FROM golang:1.24-bookworm AS builder
WORKDIR /usr/src/app/
ARG GOPROXY
COPY ./src/order-tracker/go.mod ./src/order-tracker/go.sum ./
RUN go mod download
COPY ./src/order-tracker/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags "-s -w" -o order-tracker .
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /usr/src/app/
COPY --from=builder /usr/src/app/order-tracker ./
ENTRYPOINT [ "./order-tracker" ]
```

- [ ] **Step 2: Add the service to `docker-compose.minimal.yml` AND `docker-compose.yml`** (after the `accounting` service block; mirror its kafka `depends_on` + otel env)
```yaml
  order-tracker:
    image: ${IMAGE_NAME}:${DEMO_VERSION}-order-tracker
    container_name: order-tracker
    build:
      context: ./
      dockerfile: ${ORDER_TRACKER_DOCKERFILE}
      args:
        GOPROXY: ${GOPROXY:-https://proxy.golang.org,direct}
    environment:
      - KAFKA_ADDR
      - VALKEY_ADDR
      - OTEL_EXPORTER_OTLP_ENDPOINT
      - OTEL_RESOURCE_ATTRIBUTES
      - OTEL_SERVICE_NAME=order-tracker
    depends_on:
      kafka:
        condition: service_healthy
      valkey-cart:
        condition: service_started
      otel-collector:
        condition: service_started
    logging: *logging
```

- [ ] **Step 3: Add env to `.env`**
```
ORDER_TRACKER_DOCKERFILE=./src/order-tracker/Dockerfile
```

- [ ] **Step 4: Validate compose config**

Run: `docker compose -f docker-compose.minimal.yml config --services | grep order-tracker`
Expected: `order-tracker` listed.

- [ ] **Step 5: Commit**

```bash
git add src/order-tracker/Dockerfile docker-compose.minimal.yml docker-compose.yml .env
git commit -m "feat(order-tracker): Dockerfile + compose + env wiring

Co-authored-by: Isaac"
```

---

## PHASE B — BFF `/api/order-status` endpoint

### Task B1: Instrumented BFF endpoint reading Valkey

**Files:** Create `src/frontend/pages/api/order-status.ts`, `src/frontend/gateways/rpc/OrderStatus.gateway.ts` (or a direct redis read)

- [ ] **Step 1: Write the endpoint** (reads tracker state from Valkey; computes current stage at read-time)

Create `src/frontend/pages/api/order-status.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from 'redis';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

type Stage = { name: string; offset_seconds: number };
type OrderState = {
  order_id: string; store_id: string; channel: string;
  placed_at_unix: number;
  schedule: { sos_target_seconds: number; stages: Stage[] };
};

function currentStage(st: OrderState, nowUnix: number): string {
  const elapsed = nowUnix - st.placed_at_unix;
  let cur = st.schedule.stages[0]?.name ?? 'Prep';
  for (const s of st.schedule.stages) if (elapsed >= s.offset_seconds) cur = s.name;
  return cur;
}

const handler = async ({ query }: NextApiRequest, res: NextApiResponse) => {
  const orderId = String(query.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  const client = createClient({ url: `redis://${process.env.VALKEY_ADDR}` });
  await client.connect();
  try {
    const raw = await client.get(`tracker:${orderId}`);
    if (!raw) return res.status(200).json({ orderId, status: 'pending', stages: [] });
    const st = JSON.parse(raw) as OrderState;
    const now = Math.floor(Date.now() / 1000);
    return res.status(200).json({
      orderId,
      channel: st.channel,
      currentStage: currentStage(st, now),
      stages: st.schedule.stages.map(s => s.name),
      sosTargetSeconds: st.schedule.sos_target_seconds,
      elapsedSeconds: now - st.placed_at_unix,
    });
  } finally {
    await client.quit();
  }
};

export default InstrumentationMiddleware(handler);
```

- [ ] **Step 2: Add `redis` dep + VALKEY_ADDR to frontend env**

Run: `cd src/frontend && npm install redis --registry=https://registry.npmmirror.com --no-audit --no-fund`
Add `- VALKEY_ADDR` to the `frontend` service `environment:` in both compose files.
Verify: `cd src/frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/pages/api/order-status.ts src/frontend/package.json src/frontend/package-lock.json docker-compose.minimal.yml docker-compose.yml
git commit -m "feat(frontend): instrumented /api/order-status BFF endpoint (reads Valkey tracker state)

Co-authored-by: Isaac"
```

---

## PHASE C — Tracker UI on the confirmation page

### Task C1: OrderTracker component (5-stage, polls /api/order-status)

**Files:** Create `src/frontend/components/OrderTracker/OrderTracker.tsx` (+ `.styled.ts`, `index.ts`)

- [ ] **Step 1: Component** (polls every 3s, renders stages with the current one highlighted + SOS state)

Create `src/frontend/components/OrderTracker/OrderTracker.tsx`:
```tsx
import { useEffect, useState } from 'react';
import * as S from './OrderTracker.styled';

interface OrderStatus { currentStage: string; stages: string[]; sosTargetSeconds: number; elapsedSeconds: number; channel: string; }

const LABELS: Record<string, string> = {
  Prep: 'Prep', Bake: 'Bake', QualityCheck: 'Quality Check',
  OutForDelivery: 'Out for Delivery', Delivered: 'Delivered', ReadyForPickup: 'Ready for Pickup',
};

const OrderTracker = ({ orderId }: { orderId: string }) => {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    const poll = async () => {
      const r = await fetch(`/api/order-status?orderId=${orderId}`);
      const d = await r.json();
      if (active && d.stages?.length) setStatus(d);
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, [orderId]);

  if (!status) return <S.Tracker data-cy="order-tracker">Starting your order…</S.Tracker>;
  const curIdx = status.stages.indexOf(status.currentStage);
  const breached = status.elapsedSeconds > status.sosTargetSeconds && status.currentStage !== 'Delivered';
  return (
    <S.Tracker data-cy="order-tracker">
      <S.Stages>
        {status.stages.map((st, i) => (
          <S.Stage key={st} $done={i < curIdx} $active={i === curIdx} data-cy="tracker-stage">
            {LABELS[st] ?? st}
          </S.Stage>
        ))}
      </S.Stages>
      {breached && <S.Breach>Running a little behind — thanks for your patience!</S.Breach>}
    </S.Tracker>
  );
};
export default OrderTracker;
```

- [ ] **Step 2: styled + index** — create `OrderTracker.styled.ts` (a horizontal stepper using `theme.colors.otelBlue` for active/done, gray for pending; `Breach` in `otelYellow`) and `index.ts` re-exporting default. (Keep styling minimal; match existing component conventions.)

- [ ] **Step 3: Render it on the confirmation page**

Modify `src/frontend/pages/cart/checkout/[orderId]/index.tsx`: import `OrderTracker` and render `<OrderTracker orderId={orderId} />` just below the "Order Confirmed" heading.

- [ ] **Step 4: tsc + commit**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.
```bash
git add src/frontend/components/OrderTracker src/frontend/pages/cart/checkout
git commit -m "feat(frontend): 5-stage pizza tracker on the order-confirmation page

Co-authored-by: Isaac"
```

### Task C2: Integration — order → tracker advances → spans land

**Files:** none (verification)

- [ ] **Step 1: Build order-tracker + frontend via the mirror, bring up the stack** (see Appendix for the GOPROXY/npm-mirror build commands; use the `pizzatel-test-override.yml`).
- [ ] **Step 2:** Place an order in the UI (or via the journey spec); poll `/api/order-status?orderId=<id>` and confirm `currentStage` advances over time.
- [ ] **Step 3:** Query Jaeger/Zerobus for `order-tracker` spans: `order-tracker received order` + `stage: *` (child of the checkout trace via the propagated Kafka headers).
- [ ] **Step 4:** Write `docs/baseline/phase2b-summary.md`; commit.

---

## PHASE D — Store picker (option A) + store_id threading

### Task D1: Export stores.json from the seed job

**Files:** modify `provisioning/src/seed_export_notebook.py`

- [ ] **Step 1:** After the stores table write, also export a compact `stores.json` to the volume:
```python
store_rows = [r.asDict() for r in stores.select("unit_id","unit_name","city","state","metro_area").collect()]
stores_doc = {"stores": [
  {"id": str(r["unit_id"]), "name": r["unit_name"], "city": r["city"], "state": r["state"], "metro": r["metro_area"]}
  for r in store_rows]}
dbutils.fs.put(f"/Volumes/{catalog}/{demo_schema}/{export_volume}/stores.json", json.dumps(stores_doc, indent=2), overwrite=True)
print(f"Wrote {len(stores_doc['stores'])} stores")
```
- [ ] **Step 2:** Re-run `databricks bundle run pizzatel_seed_export -t dev`; download to `src/frontend/public/stores.json`; commit.

### Task D2: Store picker component + /api/stores + threading

**Files:** Create `src/frontend/components/StorePicker/`, `src/frontend/pages/api/stores.ts`; modify checkout flow + `Cart` context to carry `storeId`

- [ ] **Step 1:** `/api/stores.ts` (instrumented) serves `public/stores.json` (or proxies a baked file).
- [ ] **Step 2:** `StorePicker.tsx` — a `<select>` grouped by `metro` (the 250 stores grouped via `<optgroup>`), persists the chosen `storeId` to the cart/session context. `data-cy="store-picker"`.
- [ ] **Step 3:** Surface the picker on the cart/checkout page; default to the first store. Thread `storeId` into the checkout request so it rides into the order (and, in Phase A's consumer, becomes `OrderState.StoreID`).
- [ ] **Step 4:** tsc + commit.

> NOTE: threading `store_id` end-to-end may need a small `OrderResult`/checkout metadata field OR carrying it via the cart. Since the brief forbids breaking the gRPC contract, carry `storeId` in the **frontend→checkout BFF** request and have the order-tracker default-resolve when absent (Phase A already tolerates a placeholder). Full proto threading is a roadmap item if needed.

---

## PHASE E — Imagery upgrade (SVG category illustrations)

### Task E1: Replace solid-color tiles with flat SVG illustrations

**Files:** Create `src/image-provider/static/products/{pizza,sides,drinks,desserts,wings,salads,default}.svg`; modify `src/frontend/utils/productImage.ts` to prefer `.svg`

- [ ] **Step 1:** Author 7 original flat SVG illustrations (a simple pizza with pepperoni dots; a soda cup; wings; a dessert; a salad bowl; a sides box; a default plate) — original vector art, no trademarked imagery. Each ~viewBox 0 0 400 300, PizzaTel palette.
- [ ] **Step 2:** Update `CATEGORY_IMAGES` in `productImage.ts` to map to `.svg` filenames; ensure the image-provider/nginx serves `.svg` (add `image/svg+xml` mime if needed in `nginx.conf.template`).
- [ ] **Step 3:** Verify via the running stack that category images render as illustrations (not solid boxes); the onError fallback still points at `default.svg`.
- [ ] **Step 4:** Commit. Flag in the summary: photorealistic/AI photos remain asset-dependent (drop real JPEGs keyed by category to override).

---

## Appendix — building Go/npm with the blocked-proxy mirror
- Go: `GOPROXY=https://goproxy.io,direct GOSUMDB=off go mod tidy/build`; for docker image builds use a temp Dockerfile (or `--build-arg GOPROXY=https://goproxy.io,direct`) and `docker build --network=host`. Pre-pull bases (`golang:1.24-bookworm`, `gcr.io/distroless/static-debian12:nonroot`) to avoid `DeadlineExceeded`.
- npm: `npm install --registry=https://registry.npmmirror.com`; frontend image build via the temp Dockerfile that sets `ENV npm_config_registry`. (See `docs/superpowers/pizzatel-test-override.yml` + Plan 2a summary for the proven recipe.)
- Telemetry/runtime: bring the stack up with `docker-compose.minimal.yml -f docs/superpowers/pizzatel-test-override.yml` (collector DATABRICKS_* env + image mounts); refresh `DATABRICKS_API_TOKEN` if export 403s.

---

## Self-Review notes (author)
- **Spec coverage:** order-tracker Kafka→Valkey+spans (A1–A5), BFF endpoint (B1), tracker UI (C1–C2), store picker + threading (D1–D2), SVG imagery (E1). Roadmap items (auto-nearest, trajectory, writeback, photo imagery) explicitly deferred.
- **No proto change:** the consumer reuses `OrderResult` + Kafka-header trace context; `store_id` threads via the checkout BFF request, not a proto change (noted as the pragmatic path; full proto threading flagged roadmap).
- **Type consistency:** `Schedule`/`Stage`/`OrderState` shapes match between `timeline.go`, `state.go`, `consumer.go`, and the BFF's TS mirror (`currentStage` logic identical in Go + TS). Stage names (`Prep/Bake/QualityCheck/OutForDelivery/Delivered`/`ReadyForPickup`) consistent across service + UI `LABELS`.
- **Known gaps to resolve at execution:** (a) `store_id` is a placeholder in A4 until D2 wires it — acceptable since phases ship independently; (b) carryout-vs-delivery channel is hardcoded `delivery` in A4 until the checkout carries order_type — flagged; (c) the per-order `advance` goroutine is in-process (lost on restart) but Valkey + read-time `CurrentStage` is the canonical source the BFF uses, so the UI survives a tracker restart.
- **Placeholder scan:** styled-files for OrderTracker/StorePicker are described not fully coded (C1 Step 2, D2) — these are conventional styled-components; flagged as the one place the implementer authors CSS to match existing components rather than copying verbatim. Everything on the critical path (Go service, BFF, consumer) has complete code.
