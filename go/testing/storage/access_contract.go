package storage

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	"testing"
)

func accessContract(t *testing.T, check func(string, func(*testing.T, a.Storage, Fixture))) {
	check("login states expire and are consumed once", func(t *testing.T, db a.Storage, _ Fixture) {
		key := a.SessionKey{Kind: a.SessionLogin, Device: b(1), Purpose: "unlock"}
		must(db.PutSession(b(1), key, b(9), 100))
		other := key
		other.Purpose = "kit"
		equal(t, value(db.Session(b(1), other, 101)), []byte(nil))
		equal(t, value(db.Session(b(2), key, 101)), []byte(nil))
		equal(t, value(db.ConsumeSession(b(1), key, 120100)), []byte(nil))
		must(db.PutSession(b(1), key, b(9), 200))
		equal(t, value(db.ConsumeSession(b(1), key, 201)), b(9))
		equal(t, value(db.ConsumeSession(b(1), key, 201)), []byte(nil))
	})
	check("join tickets expire and commit consumes them", func(t *testing.T, db a.Storage, _ Fixture) {
		key := a.SessionKey{Kind: a.SessionJoinTicket, Device: b(1), Purpose: "join"}
		must(db.PutSession(b(1), key, b(9), 0))
		equal(t, value(db.Session(b(1), key, 599999)), b(9))
		equal(t, value(db.Session(b(1), key, 600000)), []byte(nil))
		must(db.PutSession(b(1), key, b(9), 0))
		s := swap(1)
		s.ConsumeSessions = []a.SessionKey{key}
		value(db.CommitSwap(b(1), nil, s, 1))
		equal(t, value(db.Session(b(1), key, 2)), []byte(nil))
	})
	check("nonces expire after ten minutes", func(t *testing.T, db a.Storage, _ Fixture) {
		equal(t, value(db.RememberNonce(b(1), b(2), 0)), true)
		equal(t, value(db.RememberNonce(b(1), b(2), 1)), false)
		equal(t, value(db.RememberNonce(b(2), b(2), 1)), true)
		equal(t, value(db.RememberNonce(b(1), b(2), 600000)), true)
	})
	check("rate limits isolate, refund and double", func(t *testing.T, db a.Storage, _ Fixture) {
		bucket := a.RateBucket{Kind: "non-member"}
		for i := 0; i < 5; i++ {
			equal(t, value(db.Charge(b(1), bucket, 0)).Kind, "charged")
		}
		equal(t, value(db.Charge(b(1), bucket, 1)), a.RateCharge{Kind: "locked", Until: 900000})
		equal(t, value(db.Charge(b(2), bucket, 1)).Kind, "charged")
		for i := 0; i < 5; i++ {
			value(db.Charge(b(1), bucket, 900000))
		}
		equal(t, value(db.Charge(b(1), bucket, 900001)), a.RateCharge{Kind: "locked", Until: 2700000})
		charge := value(db.Charge(b(1), a.RateBucket{Kind: "member", Device: b(4)}, 0))
		equal(t, value(db.Refund(charge.Receipt, 1)), true)
		equal(t, value(db.Refund(charge.Receipt, 1)), false)
	})
	check("mailbox numbers and write-once slots", func(t *testing.T, db a.Storage, _ Fixture) {
		equal(t, value(db.OpenMailbox(b(1), b(2), 0)).Number, 1)
		equal(t, value(db.OpenMailbox(b(2), b(2), 0)).Number, 2)
		for _, row := range []struct {
			slot a.MailboxSlot
			data []byte
			want a.MailboxWrite
		}{{a.SlotPairJoiner, b(2), "out-of-order"}, {a.SlotKE1, b(2), "written"}, {a.SlotKE1, b(2), "identical"}, {a.SlotKE1, b(3), "closed"}} {
			equal(t, value(db.WriteMailbox(b(1), 1, row.slot, row.data, 1)), row.want)
		}
		equal(t, value(db.OpenMailbox(b(1), b(2), 1)).Number, 1)
		equal(t, value(db.Mailbox(b(1), 1, 600001)), (*a.StoredMailbox)(nil))
	})
	check("ten mailboxes per vault per rolling hour", func(t *testing.T, db a.Storage, _ Fixture) {
		for i := 0; i < 10; i++ {
			box := value(db.OpenMailbox(b(1), b(2), int64(i)))
			if box != nil {
				must(db.CloseMailbox(b(1), box.Number))
			}
		}
		equal(t, value(db.OpenMailbox(b(1), b(2), 100)), (*a.StoredMailbox)(nil))
		equal(t, value(db.OpenMailbox(b(1), b(2), 3600000)).Number, 1)
	})
	check("pair commit closes mailbox; approver lasts 24h", func(t *testing.T, db a.Storage, _ Fixture) {
		value(db.OpenMailbox(b(1), b(2), 0))
		s := swap(1)
		n := 1
		s.CloseMailbox = &n
		s.Approver = &a.StoredApprover{Device: b(3), Bytes: b(9)}
		value(db.CommitSwap(b(1), nil, s, 1))
		equal(t, value(db.Mailbox(b(1), 1, 2)), (*a.StoredMailbox)(nil))
		equal(t, value(db.Approver(b(1), b(3), 86400000)), b(9))
		equal(t, value(db.Approver(b(1), b(3), 86400001)), []byte(nil))
	})
}
