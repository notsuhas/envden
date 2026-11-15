package status

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"time"

	a "github.com/notsuhas/envden/go/core/adapters"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	x "github.com/notsuhas/envden/go/server/shared"
)

type Prune struct {
	At int64
	OK bool
}
type State struct {
	Enabled   bool
	StartedAt int64
	LastPrune *Prune
	start     int64
	count     int
}

func New(start int64, env map[string]string) *State {
	return &State{Enabled: env["ENVDEN_STATUS_PAGE"] != "off", StartedAt: start}
}
func (v *State) Admit(now int64) bool {
	if v.count == 0 || now-v.start >= 60000 {
		v.start = now
		v.count = 1
		return true
	}
	if v.count >= 60 {
		return false
	}
	v.count++
	return true
}
func QuotaBand(usages []int64) *string {
	if len(usages) == 0 {
		return nil
	}
	var largest int64
	for _, n := range usages {
		largest = max(largest, n)
	}
	share := float64(largest) / float64(a.VaultQuotaBytes)
	band := "below-50"
	if share >= 0.95 {
		band = "95-plus"
	} else if share >= 0.8 {
		band = "80-95"
	} else if share >= 0.5 {
		band = "50-80"
	}
	return &band
}
func ServerMode(vaults []a.StoredVault) string {
	moved := len(vaults) > 0
	for _, v := range vaults {
		if v.Restored != nil {
			return "restored"
		}
		if v.ServerMoved == nil {
			moved = false
		}
	}
	if moved {
		return "moved"
	}
	return "normal"
}
func Read(o x.Options, state *State) s.StatusResponse {
	ids := x.Must(o.Storage.VaultIDs())
	usages := make([]int64, 0, len(ids))
	vaults := []a.StoredVault{}
	var total int64
	for _, id := range ids {
		n := x.Must(o.Storage.VaultUsage(id))
		usages = append(usages, n)
		total += n
	}
	for _, id := range ids {
		v := x.Must(o.Storage.Vault(id))
		if v != nil {
			vaults = append(vaults, *v)
		}
	}
	result := s.StatusResponse{Version: o.Config.AppVersion, UptimeSeconds: max(0, (o.Now()-state.StartedAt)/1000), Mode: ServerMode(vaults), Vaults: int64(len(ids)), StorageBytes: total, FullestVault: QuotaBand(usages)}
	if state.LastPrune != nil {
		result.LastPrune = &s.LastPrune{At: time.UnixMilli(state.LastPrune.At).UTC().Format("2006-01-02T15:04:05.000Z"), OK: state.LastPrune.OK}
	}
	return result
}
func Headers(h http.Header) {
	digest := sha256.Sum256([]byte(style))
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'sha256-"+base64.StdEncoding.EncodeToString(digest[:])+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Cache-Control", "no-store")
}
