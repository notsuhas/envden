package server

import (
	"regexp"
	"time"
)

type LastPrune struct {
	At string `json:"at"`
	OK bool   `json:"ok"`
}

type StatusResponse struct {
	Version       string     `json:"version"`
	UptimeSeconds int64      `json:"uptimeSeconds"`
	Mode          string     `json:"mode"`
	Vaults        int64      `json:"vaults"`
	StorageBytes  int64      `json:"storageBytes"`
	FullestVault  *string    `json:"fullestVault"`
	LastPrune     *LastPrune `json:"lastPrune"`
}

var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$`)

func datetime(v any) bool {
	s, ok := v.(string)
	if !ok || !isoDate.MatchString(s) {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, s)

	return err == nil
}

var StatusResponseSchema = Schema[StatusResponse]{object(map[string]field{"version": req(stringValue), "uptimeSeconds": req(count), "mode": req(enum("normal", "restored", "moved")), "vaults": req(count), "storageBytes": req(count), "fullestVault": req(nullable(enum("below-50", "50-80", "80-95", "95-plus"))), "lastPrune": req(nullable(object(map[string]field{"at": req(datetime), "ok": req(boolValue)})))})}
