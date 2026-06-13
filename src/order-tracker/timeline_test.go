package main

import "testing"

func TestBuildScheduleDeliveryStagesAndSOS(t *testing.T) {
	s := BuildSchedule("delivery", 1800, 1200)
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
	}
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

func TestSamplePrepSecondsRanges(t *testing.T) {
	for i := 0; i < 200; i++ {
		if c := SamplePrepSeconds("carryout"); c < 60 {
			t.Fatalf("carryout prep too low: %d", c)
		}
		if d := SamplePrepSeconds("delivery"); d < 300 {
			t.Fatalf("delivery prep too low: %d", d)
		}
	}
}
