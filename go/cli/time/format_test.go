package time

import (
	"testing"
	"time"
)

func TestFormat(t *testing.T) {
	at := time.Date(2027, 1, 15, 8, 0, 0, 0, time.UTC).UnixMilli()
	for _, row := range []struct{ zone, want string }{{"UTC", "2027-01-15 08:00 GMT+0"}, {"Asia/Kolkata", "2027-01-15 13:30 GMT+5:30"}, {"America/New_York", "2027-01-15 03:00 GMT-5"}} {
		got, e := LocalTime(at, row.zone)
		if e != nil || got != row.want {
			t.Fatal(got, e)
		}
	}
	for _, row := range []struct {
		now  int64
		want string
	}{{at + 600000, "10 minutes ago"}, {at - 30*86400000, "in 1 month"}, {at + 5000, "5 seconds ago"}} {
		if got := RelativeTime(at, row.now); got != row.want {
			t.Fatal(got)
		}
	}
	got, e := WhenText(at, at+3600000, "Asia/Kolkata")
	if e != nil || got != "1 hour ago (2027-01-15 13:30 GMT+5:30)" {
		t.Fatal(got, e)
	}
}
