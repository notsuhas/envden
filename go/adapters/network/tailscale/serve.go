package tailscale

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

func serveConflict(stdout, hostname string, port int, target string) (bool, error) {
	raw := strings.TrimSpace(stdout)
	if raw == "" || raw == "null" {
		raw = "{}"
	}
	m, ok := object([]byte(raw))
	invalid := errors.New(errors.InvalidData, "Invalid Tailscale serve status")
	if !ok {
		return false, invalid
	}
	tcp := map[string]map[string]json.RawMessage{}
	web := map[string]map[string]map[string]json.RawMessage{}
	if v, exists := m["TCP"]; exists {
		entries, ok := object(v)
		if !ok {
			return false, invalid
		}
		for k, v := range entries {
			o, ok := object(v)
			if !ok {
				return false, invalid
			}
			if f, exists := o["TCPForward"]; exists {
				if _, ok = text(f); !ok {
					return false, invalid
				}
			}
			tcp[k] = o
		}
	}
	if v, exists := m["Web"]; exists {
		entries, ok := object(v)
		if !ok {
			return false, invalid
		}
		for k, v := range entries {
			o, ok := object(v)
			if !ok {
				return false, invalid
			}
			handlers, ok := object(o["Handlers"])
			if !ok {
				return false, invalid
			}
			web[k] = map[string]map[string]json.RawMessage{}
			for path, v := range handlers {
				h, ok := object(v)
				if !ok {
					return false, invalid
				}
				if p, exists := h["Proxy"]; exists {
					if _, ok = text(p); !ok {
						return false, invalid
					}
				}
				web[k][path] = h
			}
		}
	}
	listener := tcp[strconv.Itoa(port)]
	site := web[hostname+":"+strconv.Itoa(port)]
	if listener == nil && site == nil {
		return false, nil
	}
	forward, _ := text(listener["TCPForward"])
	if forward != "" || site == nil {
		return true, nil
	}
	proxy, _ := text(site["/"]["Proxy"])

	return len(site) != 1 || site["/"] == nil || proxy != target, nil
}
