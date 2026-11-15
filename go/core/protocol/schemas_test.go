package protocol_test

import (
	"strings"
	"testing"

	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

func TestWireSchemaRejections(t *testing.T) {
	for _, tc := range []struct {
		n  int
		ok bool
	}{{4266910, true}, {4266911, false}} {
		_, err := s.ObjectsResponseSchema.Decode([]byte(`{"objects":["` + strings.Repeat("A", tc.n) + `"]}`))
		eq(t, err == nil, tc.ok)
	}
	for _, tc := range []struct {
		n  int
		ok bool
	}{{43, true}, {44, false}} {
		_, err := s.RepairStatusSchema.Decode([]byte(`{"restoredHead":"` + strings.Repeat("A", tc.n) + `","repairId":"A"}`))
		eq(t, err == nil, tc.ok)
	}
	for _, raw := range []string{`{}`, `{"kind":"pending","extra":true}`, `{"kind":null}`, `{"kind":"pending"} {}`} {
		_, err := s.PendingResponseSchema.Decode([]byte(raw))
		reject(t, err)
	}
	for _, raw := range []string{`{"purpose":"unlock","message":"!"}`, `{"purpose":"kit","message":"AA"}`, `{"purpose":"other","message":"AA"}`} {
		_, err := s.LoginStartSchema.Decode([]byte(raw))
		reject(t, err)
	}
	for _, raw := range []string{`{"period":1}`, `{"period":"86400000"}`, `{}`} {
		_, err := s.UnlockPeriodSchema.Decode([]byte(raw))
		reject(t, err)
	}
	for _, raw := range []string{`{"period":null}`, `{"period":86400000}`, `{"period":604800000}`, `{"period":2592000000}`} {
		must(s.UnlockPeriodSchema.Decode([]byte(raw)))
	}
	for _, raw := range []string{`{"kind":"head-moved","head":"!"}`, `{"kind":"committed","head":"A"}`, `{"kind":"head-moved","head":null}`} {
		_, err := s.CommitResponseSchema.Decode([]byte(raw))
		reject(t, err)
	}
	for _, raw := range []string{`{"kind":"committed"}`, `{"kind":"retry-of-committed"}`, `{"kind":"head-moved"}`, `{"kind":"head-moved","head":"A"}`} {
		must(s.CommitResponseSchema.Decode([]byte(raw)))
	}
	for _, raw := range []string{`{"devices":[{"id":"A","clientVersion":null,"confirmed":true,"extra":0}]}`, `{"devices":[{"id":"A","confirmed":true}]}`} {
		_, err := s.DevicesResponseSchema.Decode([]byte(raw))
		reject(t, err)
	}
}
