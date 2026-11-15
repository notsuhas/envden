package operation

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Authorization string

func OperationRequirement(previous, header manifests.ManifestHeader, entries []codecs.Signed[codecs.Entry], before *devicechain.State, onNewServer ...bool) (Authorization, error) {
	return chainshared.TryResult(func() (Authorization, error) {
		op := header.Op
		if err := chainshared.Check(op >= 1 && op <= 13); err != nil {
			return *new(Authorization), err
		}

		count := 1
		if op == 1 || op == 8 || op == 11 {
			count = 0
		}
		if err := chainshared.Check(len(entries) == count); err != nil {
			return *new(Authorization), err
		}

		epochChange := op == 4 || op == 5 || op == 6 || op == 7 || op == 9
		envelopeChange := op == 5 || op == 7 || op == 8 || op == 9
		delta := 0
		if epochChange {
			delta = 1
		}
		if err := chainshared.Check(header.Epoch == previous.Epoch+delta); err != nil {
			return *new(Authorization), err
		}
		if err := chainshared.Check(epochChange != encoding.Equal(header.KeyringHash, previous.KeyringHash)); err != nil {
			return *new(Authorization), err
		}
		if err := chainshared.Check(envelopeChange != encoding.Equal(header.EnvelopeHash, previous.EnvelopeHash)); err != nil {
			return *new(Authorization), err
		}
		if err := chainshared.Check((op == 1 || op == 11) != encoding.Equal(header.FilesHash, previous.FilesHash)); err != nil {
			return *new(Authorization), err
		}

		var entry codecs.Entry
		if len(entries) > 0 {
			entry = entries[0].Body
		}
		switch op {
		case 1:
			return "unlocked", nil

		case 2, 3:
			err := chainshared.Check(entry.Kind == 1)
			if err != nil {
				return *new(Authorization), err
			}
			err = chainshared.Check(encoding.Equal(entry.Signer, before.Recovery.Id) == (op == 3))
			if err != nil {
				return *new(Authorization), err
			}
			if op == 3 {
				if err := chainshared.Check(encoding.Equal(header.Signer, entry.Payload.(entrypayloads.AddDevice).Device.Id)); err != nil {
					return *new(Authorization), err
				}

				return "join-ticket", nil
			}

			return "mailbox-grant", nil

		case 4, 5:
			err := chainshared.Check(entry.Kind == 2)
			if err != nil {
				return *new(Authorization), err
			}
			err = chainshared.Check((entry.Payload.(entrypayloads.RemoveDevice).NewRecovery != nil) == (op == 5))
			if err != nil {
				return *new(Authorization), err
			}
			if op == 5 {
				return "fresh", nil
			}

			return "fresh-or-repair-token", nil

		case 6:
			err := chainshared.Check(entry.Kind == 3)
			if err != nil {
				return *new(Authorization), err
			}

			return "fresh", nil

		case 7:
			err := chainshared.Check(entry.Kind == 4)
			if err != nil {
				return *new(Authorization), err
			}

			return "fresh", nil

		case 8:
			return "fresh", nil

		case 9:
			err := chainshared.Check(entry.Kind == 4)
			if err != nil {
				return *new(Authorization), err
			}

			return "sk-proof", nil

		case 10:
			err := chainshared.Check(entry.Kind == 5)
			if err != nil {
				return *new(Authorization), err
			}
			if len(onNewServer) > 0 && onNewServer[0] {
				return "move-import", nil
			}

			return "move-session", nil

		case 11:
			return "repair-token", nil

		case 12:
			err := chainshared.Check(entry.Kind == 6)
			if err != nil {
				return *new(Authorization), err
			}

			return "repair-token", nil

		case 13:
			err := chainshared.Check(entry.Kind == 7 && encoding.Equal(header.Signer, entry.Signer))
			if err != nil {
				return *new(Authorization), err
			}

			return "unlocked", nil
		}

		return "", nil
	})
}
