package main

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type OrderState struct {
	OrderID  string   `json:"order_id"`
	StoreID  string   `json:"store_id"`
	Channel  string   `json:"channel"`
	PlacedAt int64    `json:"placed_at_unix"`
	Schedule Schedule `json:"schedule"`
}

type Store struct{ client *redis.Client }

func NewStore(addr string) *Store {
	return &Store{client: redis.NewClient(&redis.Options{Addr: addr})}
}

func key(orderID string) string { return "tracker:" + orderID }

func (s *Store) Put(ctx context.Context, st OrderState) error {
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	return s.client.Set(ctx, key(st.OrderID), b, 6*time.Hour).Err()
}

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
