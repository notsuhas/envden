package status

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	"testing"
	"time"
)

func TestDecisions(t *testing.T) {
	normal := a.StoredVault{Active: true}
	moved := a.StoredVault{Active: true, ServerMoved: make([]byte, 32)}
	restored := a.StoredVault{Active: true, Restored: &a.StoredRestored{}}
	for _, row := range []struct {
		vaults []a.StoredVault
		want   string
	}{{nil, "normal"}, {[]a.StoredVault{normal, moved}, "normal"}, {[]a.StoredVault{moved, moved}, "moved"}, {[]a.StoredVault{moved, restored}, "restored"}} {
		if got := ServerMode(row.vaults); got != row.want {
			t.Fatal(got, row.want)
		}
	}
	quota := int64(a.VaultQuotaBytes)
	for _, row := range []struct {
		usage []int64
		want  string
	}{{nil, ""}, {[]int64{0, quota * 49 / 100}, "below-50"}, {[]int64{quota / 2, 0}, "50-80"}, {[]int64{quota*8/10 + 1}, "80-95"}, {[]int64{quota*95/100 - 1}, "80-95"}, {[]int64{quota * 2}, "95-plus"}} {
		got := QuotaBand(row.usage)
		if row.want == "" {
			if got != nil {
				t.Fatal(got)
			}
		} else if got == nil || *got != row.want {
			t.Fatal(got, row.want)
		}
	}
	state := New(5, nil)
	for range 60 {
		if !state.Admit(1000) {
			t.Fatal("early limit")
		}
	}
	if state.Admit(60999) || !state.Admit(61000) {
		t.Fatal("window boundary")
	}
	if !New(5, nil).Enabled || !New(5, map[string]string{"ENVDEN_STATUS_PAGE": "on"}).Enabled || New(5, map[string]string{"ENVDEN_STATUS_PAGE": "off"}).Enabled {
		t.Fatal("status toggle")
	}
}
func TestFormats(t *testing.T) {
	for _, row := range []struct {
		seconds int64
		want    string
	}{{59, "under a minute"}, {3660, "1 hour 1 minute"}, {90000, "1 day 1 hour"}} {
		if got := FormatUptime(row.seconds); got != row.want {
			t.Fatal(got, row.want)
		}
	}
	now := time.Date(2027, 1, 15, 8, 12, 0, 0, time.UTC).UnixMilli()
	if got := FormatWhen("2027-01-15T08:00:00.000Z", now); got != "12 minutes ago (2027-01-15 08:00 UTC)" {
		t.Fatal(got)
	}
}
