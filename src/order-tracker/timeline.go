package main

import "math/rand"

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
// Delivery → 5 stages ending in Delivered; carryout ends at ReadyForPickup.
// SOS target mirrors synthData: 720 carryout / 1800 delivery.
func BuildSchedule(channel string, prepSecs, deliverySecs int) Schedule {
	isDelivery := channel != "carryout"
	sos := 720
	if isDelivery {
		sos = 1800
	}
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

// SamplePrepSeconds mirrors synthData entropy.prep_time_seconds:
// carryout ~Gauss(12min,3min) floored 60; delivery ~Gauss(31min,6min) floored 300.
func SamplePrepSeconds(channel string) int {
	if channel == "carryout" {
		v := int(rand.NormFloat64()*180 + 720)
		if v < 60 {
			v = 60
		}
		return v
	}
	v := int(rand.NormFloat64()*360 + 1860)
	if v < 300 {
		v = 300
	}
	return v
}

// SampleDeliverySeconds mirrors actual_delivery_seconds = prep + rand(600,1800).
func SampleDeliverySeconds() int { return 600 + rand.Intn(1200) }
