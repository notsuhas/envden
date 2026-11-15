package adapters

import (
	"bytes"
	e "github.com/notsuhas/envden/go/core/errors"
)

type CommitPreparer interface {
	SetupToken() ([]byte, error)
	ConsumeSession([]byte, SessionKey, int64) ([]byte, error)
	Mailbox([]byte, int, int64) (*StoredMailbox, error)
	ConfigureVault([]byte, StoredVault, []StateWrite, []byte) error
	HasVault([]byte) (bool, error)
}

func PrepareCommit(storage CommitPreparer, vault []byte, swap StoredSwap, now int64) error {
	if swap.SetupTokenHash != nil {
		token, err := storage.SetupToken()
		if err != nil {
			return err
		}
		if token == nil || !bytes.Equal(token, swap.SetupTokenHash) {
			return e.New(e.Unauthorized, "Setup token changed or consumed")
		}
	}
	for _, session := range swap.ConsumeSessions {
		found, err := storage.ConsumeSession(vault, session, now)
		if err != nil {
			return err
		}
		if found == nil {
			return e.New(e.Unauthorized, "Session expired or consumed")
		}
	}
	if swap.CloseMailbox != nil {
		box, err := storage.Mailbox(vault, *swap.CloseMailbox, now)
		if err != nil {
			return err
		}
		if box == nil {
			return e.New(e.NotFound, "Mailbox expired or closed")
		}
	}
	if swap.Vault != nil {
		if err := storage.ConfigureVault(vault, *swap.Vault, nil, nil); err != nil {
			return err
		}
	}
	found, err := storage.HasVault(vault)
	if err != nil {
		return err
	}
	if !found {
		return e.New(e.InvalidData, "Creation requires vault metadata")
	}
	return nil
}

type CommitWriter interface {
	WriteState([]byte, []StateWrite) error
	PutDevice([]byte, []byte, StoredDevice) error
}

func WriteCommitState(storage CommitWriter, vault []byte, swap StoredSwap) error {
	writes := swap.State
	if writes == nil {
		writes = []StateWrite{}
	}
	if err := storage.WriteState(vault, writes); err != nil {
		return err
	}
	for _, device := range swap.Devices {
		if err := storage.PutDevice(vault, device.ID, device.State); err != nil {
			return err
		}
	}
	return nil
}
