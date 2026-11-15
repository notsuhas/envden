package unlock

import (
	"testing"
)

func TestDeriveUnlock(t *testing.T) {
	future, past, period := int64(200), int64(50), int64(30)
	for _, row := range []struct {
		recorded *int64
		present  bool
		probe    Probe
		want     string
	}{
		{&future, true, Probe{Kind: "locked"}, "locked"}, {&future, true, Probe{Kind: "unlocked", Period: &period}, "until"}, {&past, true, Probe{Kind: "unlocked", Period: &period}, "unrecorded"}, {nil, false, Probe{Kind: "unlocked", Period: &period}, "unrecorded"}, {nil, false, Probe{Kind: "unlocked"}, "never"}, {nil, true, Probe{Kind: "unreachable"}, "never"}, {nil, false, Probe{Kind: "unreachable"}, "unknown"}, {&past, true, Probe{Kind: "unreachable"}, "locked"}, {&future, true, Probe{Kind: "unreachable"}, "until"},
	} {
		if got := DeriveUnlock(row.recorded, row.present, row.probe, 100); got.Kind != row.want {
			t.Fatalf("%+v got %+v", row, got)
		}
	}
}
