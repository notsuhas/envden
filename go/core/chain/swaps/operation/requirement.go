package operation

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Authorization string

func OperationRequirement(previous, header m.ManifestHeader, entries []c.Signed[c.Entry], before *d.State, onNewServer ...bool) (Authorization, error) {

	return s.Try(func() Authorization {
		op := header.Op
		s.Check(op >= 1 && op <= 13)
		count := 1
		if op == 1 || op == 8 || op == 11 {
			count = 0
		}
		s.Check(len(entries) == count)
		epochChange := op == 4 || op == 5 || op == 6 || op == 7 || op == 9
		envelopeChange := op == 5 || op == 7 || op == 8 || op == 9
		delta := 0
		if epochChange {
			delta = 1
		}
		s.Check(header.Epoch == previous.Epoch+delta)
		s.Check(epochChange != b.Equal(header.KeyringHash, previous.KeyringHash))
		s.Check(envelopeChange != b.Equal(header.EnvelopeHash, previous.EnvelopeHash))
		s.Check((op == 1 || op == 11) != b.Equal(header.FilesHash, previous.FilesHash))
		var entry c.Entry
		if len(entries) > 0 {
			entry = entries[0].Body
		}
		switch op {
		case 1:
			return "unlocked"
		case 2, 3:
			s.Check(entry.Kind == 1)
			s.Check(b.Equal(entry.Signer, before.Recovery.Id) == (op == 3))
			if op == 3 {
				s.Check(b.Equal(header.Signer, entry.Payload.(p.AddDevice).Device.Id))
				return "join-ticket"
			}
			return "mailbox-grant"
		case 4, 5:
			s.Check(entry.Kind == 2)
			s.Check((entry.Payload.(p.RemoveDevice).NewRecovery != nil) == (op == 5))
			if op == 5 {
				return "fresh"
			}
			return "fresh-or-repair-token"
		case 6:
			s.Check(entry.Kind == 3)
			return "fresh"
		case 7:
			s.Check(entry.Kind == 4)
			return "fresh"
		case 8:
			return "fresh"
		case 9:
			s.Check(entry.Kind == 4)
			return "sk-proof"
		case 10:
			s.Check(entry.Kind == 5)
			if len(onNewServer) > 0 && onNewServer[0] {
				return "move-import"
			}
			return "move-session"
		case 11:
			return "repair-token"
		case 12:
			s.Check(entry.Kind == 6)
			return "repair-token"
		case 13:
			s.Check(entry.Kind == 7 && b.Equal(header.Signer, entry.Signer))
			return "unlocked"
		}
		return ""
	})
}
