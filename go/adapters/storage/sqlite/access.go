package sqlite

import (
	"context"
	"encoding/hex"
	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/core/adapters"
)

var bg = context.Background()

func (s *storage) putSession(v []byte, k adapters.SessionKey, b []byte, now int64) {
	s.maintain(now)
	duration := int64(600000)
	if k.Kind == adapters.SessionLogin {
		duration = 120000
	}
	s.run("INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?,?)", v, k.Kind, k.Device, k.Purpose, b, now+duration)
}

func (s *storage) session(v []byte, k adapters.SessionKey, now int64) []byte {
	return s.bytes("SELECT bytes FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>?", v, k.Kind, k.Device, k.Purpose, now)
}

func (s *storage) consumeSession(v []byte, k adapters.SessionKey, now int64) []byte {
	return s.bytes("DELETE FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>? RETURNING bytes", v, k.Kind, k.Device, k.Purpose, now)
}

func (s *storage) approver(v, id []byte, now int64) []byte {
	return s.bytes("SELECT bytes FROM approvers WHERE vault=? AND device=? AND expires>?", v, id, now)
}

func (s *storage) rememberNonce(id, nonce []byte, now int64) bool {
	s.maintain(now)
	var result bool
	s.tx(func() {
		s.run("DELETE FROM nonces WHERE device=? AND nonce=? AND expires<=?", id, nonce, now)
		result = s.run("INSERT OR IGNORE INTO nonces VALUES(?,?,?)", id, nonce, now+600000) == 1
	})
	return result
}

func bucketKey(v []byte, b adapters.RateBucket) string {
	switch b.Kind {
	case "mailbox":
		if b.Device != nil {
			return "mailbox-writer:" + hex.EncodeToString(b.Device)
		}
		return "mailbox:" + hex.EncodeToString(v)
	case "member":
		return "member:" + hex.EncodeToString(b.Device)
	default:
		return "vault:" + hex.EncodeToString(v)
	}
}

func (s *storage) charge(v []byte, b adapters.RateBucket, now int64) adapters.RateCharge {
	var result adapters.RateCharge
	key := bucketKey(v, b)
	s.tx(func() {
		s.run("DELETE FROM charges WHERE at<=?", now-900000)
		s.run("DELETE FROM buckets WHERE until<=?", now-86400000)
		var until int64
		var strikes int
		r := s.rows("SELECT CAST(until AS INTEGER),strikes FROM buckets WHERE key=?", key)
		defer r.Close()
		found := r.Next()
		if found {
			must(r.Scan(&until, &strikes))
		}
		must(r.Close())
		if found && now < until {
			result = adapters.RateCharge{Kind: "locked", Until: until}
			return
		}
		receipt := uuid.NewString()
		s.run("INSERT INTO charges VALUES(?,?,?)", receipt, key, now)
		threshold := int64(5)
		if b.Kind == "mailbox" {
			threshold = 20
		}
		if s.count("SELECT COUNT(*) FROM charges WHERE bucket=?", key) >= threshold {
			if !found || now-until >= 86400000 {
				strikes = 0
			}
			strikes++
			duration := int64(900000) << min(strikes-1, 7)
			s.run("INSERT OR REPLACE INTO buckets VALUES(?,?,?)", key, now+min(int64(86400000), duration), strikes)
		}
		result = adapters.RateCharge{Kind: "charged", Receipt: receipt}
	})
	return result
}

func (s *storage) refund(receipt string, now int64) bool {
	var found bool
	s.tx(func() {
		r := s.rows("DELETE FROM charges WHERE receipt=? AND at>? RETURNING bucket", receipt, now-900000)
		defer r.Close()
		var key string
		found = r.Next()
		if found {
			must(r.Scan(&key))
		}
		must(r.Close())
		if found {
			s.run("UPDATE buckets SET until=0,strikes=0 WHERE key=?", key)
		}
	})
	return found
}
