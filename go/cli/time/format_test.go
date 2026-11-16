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
	}{{at + 600000, "10m0s ago"}, {at - 30*86400000, "in 720h0m0s"}, {at + 5000, "5s ago"}, {at, "0s ago"}, {at - 1500, "in 2s"}} {
		if got := RelativeTime(at, row.now); got != row.want {
			t.Fatal(got)
		}
	}

	got, e := WhenText(at, at+3600000, "Asia/Kolkata")
	if e != nil || got != "1h0m0s ago (2027-01-15 13:30 GMT+5:30)" {
		t.Fatal(got, e)
	}
}

// Expected dates were generated with date-fns 4.4.0 and @date-fns/tz 1.5.0.
func TestLocalTimeDateFns(t *testing.T) {
	for _, row := range []struct {
		ms         int64
		zone, want string
	}{
		{-1, "UTC", "1969-12-31 23:59 GMT+0"},
		{0, "UTC", "1970-01-01 00:00 GMT+0"},
		{1705327200000, "UTC", "2024-01-15 14:00 GMT+0"},
		{1710053940000, "UTC", "2024-03-10 06:59 GMT+0"},
		{1710054000000, "UTC", "2024-03-10 07:00 GMT+0"},
		{1730613540000, "UTC", "2024-11-03 05:59 GMT+0"},
		{1730613600000, "UTC", "2024-11-03 06:00 GMT+0"},
		{1709251199999, "UTC", "2024-02-29 23:59 GMT+0"},
		{-1, "Asia/Kolkata", "1970-01-01 05:29 GMT+5:30"},
		{0, "Asia/Kolkata", "1970-01-01 05:30 GMT+5:30"},
		{1705327200000, "Asia/Kolkata", "2024-01-15 19:30 GMT+5:30"},
		{1710053940000, "Asia/Kolkata", "2024-03-10 12:29 GMT+5:30"},
		{1710054000000, "Asia/Kolkata", "2024-03-10 12:30 GMT+5:30"},
		{1730613540000, "Asia/Kolkata", "2024-11-03 11:29 GMT+5:30"},
		{1730613600000, "Asia/Kolkata", "2024-11-03 11:30 GMT+5:30"},
		{1709251199999, "Asia/Kolkata", "2024-03-01 05:29 GMT+5:30"},
		{-1, "America/New_York", "1969-12-31 18:59 GMT-5"},
		{0, "America/New_York", "1969-12-31 19:00 GMT-5"},
		{1705327200000, "America/New_York", "2024-01-15 09:00 GMT-5"},
		{1710053940000, "America/New_York", "2024-03-10 01:59 GMT-5"},
		{1710054000000, "America/New_York", "2024-03-10 03:00 GMT-4"},
		{1730613540000, "America/New_York", "2024-11-03 01:59 GMT-4"},
		{1730613600000, "America/New_York", "2024-11-03 01:00 GMT-5"},
		{1709251199999, "America/New_York", "2024-02-29 18:59 GMT-5"},
		{-1, "Pacific/Chatham", "1970-01-01 12:44 GMT+12:45"},
		{0, "Pacific/Chatham", "1970-01-01 12:45 GMT+12:45"},
		{1705327200000, "Pacific/Chatham", "2024-01-16 03:45 GMT+13:45"},
		{1710053940000, "Pacific/Chatham", "2024-03-10 20:44 GMT+13:45"},
		{1710054000000, "Pacific/Chatham", "2024-03-10 20:45 GMT+13:45"},
		{1730613540000, "Pacific/Chatham", "2024-11-03 19:44 GMT+13:45"},
		{1730613600000, "Pacific/Chatham", "2024-11-03 19:45 GMT+13:45"},
		{1709251199999, "Pacific/Chatham", "2024-03-01 13:44 GMT+13:45"},
		{-1, "Asia/Kathmandu", "1970-01-01 05:29 GMT+5:30"},
		{0, "Asia/Kathmandu", "1970-01-01 05:30 GMT+5:30"},
		{1705327200000, "Asia/Kathmandu", "2024-01-15 19:45 GMT+5:45"},
		{1710053940000, "Asia/Kathmandu", "2024-03-10 12:44 GMT+5:45"},
		{1710054000000, "Asia/Kathmandu", "2024-03-10 12:45 GMT+5:45"},
		{1730613540000, "Asia/Kathmandu", "2024-11-03 11:44 GMT+5:45"},
		{1730613600000, "Asia/Kathmandu", "2024-11-03 11:45 GMT+5:45"},
		{1709251199999, "Asia/Kathmandu", "2024-03-01 05:44 GMT+5:45"},
	} {
		t.Run(row.zone+"/"+time.UnixMilli(row.ms).UTC().Format(time.RFC3339Nano), func(t *testing.T) {
			got, err := LocalTime(row.ms, row.zone)
			if err != nil || got != row.want {
				t.Fatalf("got %q, %v; want %q", got, err, row.want)
			}
			previous := time.Local
			time.Local, err = time.LoadLocation(row.zone)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { time.Local = previous }()
			got, err = LocalTime(row.ms, "")
			if err != nil || got != row.want {
				t.Fatalf("default zone got %q, %v; want %q", got, err, row.want)
			}
		})
	}
	if _, err := LocalTime(0, "Invalid/Zone"); err == nil {
		t.Fatal("accepted invalid timezone")
	}
}
