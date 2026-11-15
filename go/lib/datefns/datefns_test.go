package datefns

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestReference(t *testing.T) {
	var fixtures struct {
		Formats []struct {
			MS                  int64
			Zone, Pattern, Text string
		}
		Distances []struct {
			MS   int64
			Text string
		}
		Durations []struct {
			Seconds int64
			Text    string
		}
	}
	data, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures.Formats {
		date, err := InZone(f.MS, f.Zone)
		if err != nil {
			t.Fatal(err)
		}
		if got := Format(date, f.Pattern); got != f.Text {
			t.Errorf("%v: got %q want %q", f, got, f.Text)
		}
	}
	for _, f := range fixtures.Distances {
		if got := FormatDistanceStrict(time.UnixMilli(f.MS).UTC(), time.UnixMilli(0).UTC(), DistanceOptions{AddSuffix: true}); got != f.Text {
			t.Errorf("%d got %q want %q", f.MS, got, f.Text)
		}
	}
	for _, f := range fixtures.Durations {
		if got := FormatDuration(IntervalToDuration(time.UnixMilli(0).UTC(), time.UnixMilli(f.Seconds*1000).UTC()), "days", "hours", "minutes"); got != f.Text {
			t.Errorf("%d got %q want %q", f.Seconds, got, f.Text)
		}
	}
}

func TestMilliseconds(t *testing.T) {
	for _, f := range []struct {
		d    Duration
		want int64
	}{{Duration{Years: 1}, 31556951999}, {Duration{Months: 3}, 7889237999}, {Duration{Seconds: -0.0009}, 0}, {Duration{Days: 1, Hours: 2, Minutes: 3, Seconds: 4}, 93784000}} {
		if got := Milliseconds(f.d); got != f.want {
			t.Errorf("%v: %d != %d", f.d, got, f.want)
		}
	}
}
