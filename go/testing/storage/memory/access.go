package memory

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/core/adapters"
	"strconv"
)

func sessionKey(v []byte, k adapters.SessionKey) string {
	b, e := json.Marshal([]string{hexKey(v), string(k.Kind), hexKey(k.Device), k.Purpose})
	must(e)
	return string(b)
}

func (m *memory) putSession(v []byte, k adapters.SessionKey, b []byte, now int64) {
	duration := int64(600000)
	if k.Kind == adapters.SessionLogin {
		duration = 120000
	}
	m.data.Sessions[sessionKey(v, k)] = timed{clone(b), now + duration}
}

func (m *memory) session(v []byte, k adapters.SessionKey, now int64) []byte {
	value := m.data.Sessions[sessionKey(v, k)]
	if value.Expires > now {
		return clone(value.Bytes)
	}
	return nil
}

func (m *memory) consumeSession(v []byte, k adapters.SessionKey, now int64) []byte {
	b := m.session(v, k, now)
	delete(m.data.Sessions, sessionKey(v, k))
	return b
}

func (m *memory) rememberNonce(id, n []byte, now int64) bool {
	key := pair(id, n)
	expiry, ok := m.data.Nonces[key]
	if ok && expiry > now {
		return false
	}
	m.data.Nonces[key] = now + 600000
	return true
}

func (m *memory) approver(v, id []byte, now int64) []byte {
	value := m.data.Approvers[pair(v, id)]
	if value.Expires > now {
		return clone(value.Bytes)
	}
	return nil
}

func rateKey(v []byte, b adapters.RateBucket) string {
	if b.Kind == "non-member" {
		return "vault:" + hexKey(v)
	}
	if b.Kind == "member" {
		return "member:" + hexKey(b.Device)
	}
	if b.Device != nil {
		return "mailbox-writer:" + hexKey(b.Device)
	}
	return "mailbox:" + hexKey(v)
}

func (m *memory) charge(v []byte, b adapters.RateBucket, now int64) adapters.RateCharge {
	key := rateKey(v, b)
	prior := m.data.Buckets[key]
	if now < prior.Until {
		return adapters.RateCharge{Kind: "locked", Until: prior.Until}
	}
	for r, c := range m.data.Charges {
		if c.Key == key && c.At <= now-900000 {
			delete(m.data.Charges, r)
		}
	}
	m.data.Receipt++
	receipt := strconv.Itoa(m.data.Receipt)
	m.data.Charges[receipt] = charge{key, now}
	count := 0
	for _, c := range m.data.Charges {
		if c.Key == key {
			count++
		}
	}
	threshold := 5
	if b.Kind == "mailbox" {
		threshold = 20
	}
	if count >= threshold {
		strikes := prior.Strikes + 1
		duration := min(int64(86400000), int64(900000)<<min(strikes-1, 7))
		m.data.Buckets[key] = bucket{now + duration, strikes}
	}
	return adapters.RateCharge{Kind: "charged", Receipt: receipt}
}

func (m *memory) refund(receipt string, now int64) bool {
	c, ok := m.data.Charges[receipt]
	if !ok || c.At <= now-900000 {
		return false
	}
	delete(m.data.Charges, receipt)
	b, ok := m.data.Buckets[c.Key]
	if ok {
		b.Until = 0
		m.data.Buckets[c.Key] = b
	}
	return true
}
