package sqlite

import (
	"context"
	"encoding/hex"

	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/core/adapters"
)

var bg = context.Background()

func (s *storage) putSession(v []byte, k adapters.SessionKey, b []byte, now int64) error {
	if err := s.maintain(now); err != nil {
		return err
	}

	duration := int64(600000)
	if k.Kind == adapters.SessionLogin {
		duration = 120000
	}
	_, err := s.run("INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?,?)", v, k.Kind, k.Device, k.Purpose, b, now+duration)
	if err != nil {
		return err
	}

	return nil
}

func (s *storage) session(v []byte, k adapters.SessionKey, now int64) ([]byte, error) {
	return s.bytes("SELECT bytes FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>?", v, k.Kind, k.Device, k.Purpose, now)
}

func (s *storage) consumeSession(v []byte, k adapters.SessionKey, now int64) ([]byte, error) {
	return s.bytes("DELETE FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>? RETURNING bytes", v, k.Kind, k.Device, k.Purpose, now)
}

func (s *storage) approver(v, id []byte, now int64) ([]byte, error) {
	return s.bytes("SELECT bytes FROM approvers WHERE vault=? AND device=? AND expires>?", v, id, now)
}

func (s *storage) rememberNonce(id, nonce []byte, now int64) (bool, error) {
	if err := s.maintain(now); err != nil {
		return false, err
	}

	var result bool
	if err := s.tx(func() error {
		_, err := s.run("DELETE FROM nonces WHERE device=? AND nonce=? AND expires<=?", id, nonce, now)
		if err != nil {
			return err
		}

		runResult, err := s.run("INSERT OR IGNORE INTO nonces VALUES(?,?,?)", id, nonce, now+600000)
		if err != nil {
			return err
		}

		result = runResult ==
			1

		return nil
	}); err != nil {
		return false, err
	}

	return result, nil
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

func (s *storage) charge(v []byte, b adapters.RateBucket, now int64) (adapters.RateCharge, error) {
	var result adapters.RateCharge
	key := bucketKey(v, b)
	if err := s.tx(func() error {
		_, err := s.run("DELETE FROM charges WHERE at<=?", now-900000)
		if err != nil {
			return err
		}

		_, err = s.run("DELETE FROM buckets WHERE until<=?", now-86400000)
		if err != nil {
			return err
		}

		var until int64
		var strikes int
		r, err := s.rows("SELECT CAST(until AS INTEGER),strikes FROM buckets WHERE key=?", key)
		if err != nil {
			return err
		}

		defer func() { _ = r.Close() }()
		found := r.Next()
		if found {
			if err := r.Scan(&until, &strikes); err != nil {
				return err
			}
		}
		if err := r.Close(); err != nil {
			return err
		}
		if found && now < until {
			result = adapters.RateCharge{Kind: "locked", Until: until}

			return nil
		}
		receipt := uuid.NewString()
		_, err = s.run("INSERT INTO charges VALUES(?,?,?)", receipt, key, now)
		if err != nil {
			return err
		}

		threshold := int64(5)
		if b.Kind == "mailbox" {
			threshold = 20
		}
		countResult, err := s.count("SELECT COUNT(*) FROM charges WHERE bucket=?", key)
		if err != nil {
			return err
		}
		if countResult >=
			threshold {
			if !found || now-until >= 86400000 {
				strikes = 0
			}
			strikes++
			duration := int64(900000) << min(strikes-1, 7)
			_, err := s.run("INSERT OR REPLACE INTO buckets VALUES(?,?,?)", key, now+min(int64(86400000), duration), strikes)
			if err != nil {
				return err
			}
		}
		result = adapters.RateCharge{Kind: "charged", Receipt: receipt}

		return nil
	}); err != nil {
		return adapters.RateCharge{}, err
	}

	return result, nil
}

func (s *storage) refund(receipt string, now int64) (bool, error) {
	var found bool
	if err := s.tx(func() error {
		r, err := s.rows("DELETE FROM charges WHERE receipt=? AND at>? RETURNING bucket", receipt, now-900000)
		if err != nil {
			return err
		}

		defer func() { _ = r.Close() }()
		var key string
		found = r.Next()
		if found {
			if err := r.Scan(&key); err != nil {
				return err
			}
		}
		if err := r.Close(); err != nil {
			return err
		}
		if found {
			_, err := s.run("UPDATE buckets SET until=0,strikes=0 WHERE key=?", key)
			if err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return false, err
	}

	return found, nil
}
