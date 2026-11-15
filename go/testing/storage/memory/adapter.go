package memory

import (
	"github.com/notsuhas/envden/go/core/adapters"
	s "github.com/notsuhas/envden/go/testing/storage"
	"strings"
)

func CreateMemoryStorageAdapter(operations ...[]string) adapters.Storage {
	m := &memory{data: newData()}
	o := s.Operations{ID: "memory"}
	selected := map[string]bool{}
	for _, names := range operations {
		for _, name := range names {
			selected[strings.ToLower(name)] = true
		}
	}
	if len(operations) == 0 || selected[strings.ToLower("Close")] {
		o.Close = m.Close
	}
	if len(operations) == 0 || selected[strings.ToLower("Transaction")] {
		o.Transaction = m.Transaction
	}
	if len(operations) == 0 || selected[strings.ToLower("VaultIDs")] {
		o.VaultIDs = m.VaultIDs
	}
	if len(operations) == 0 || selected[strings.ToLower("CapUnlocks")] {
		o.CapUnlocks = m.CapUnlocks
	}
	if len(operations) == 0 || selected[strings.ToLower("HasVault")] {
		o.HasVault = m.HasVault
	}
	if len(operations) == 0 || selected[strings.ToLower("Vault")] {
		o.Vault = m.Vault
	}
	if len(operations) == 0 || selected[strings.ToLower("ConfigureVault")] {
		o.ConfigureVault = m.ConfigureVault
	}
	if len(operations) == 0 || selected[strings.ToLower("DiscardInactiveVault")] {
		o.DiscardInactiveVault = m.DiscardInactiveVault
	}
	if len(operations) == 0 || selected[strings.ToLower("FindCommitted")] {
		o.FindCommitted = m.FindCommitted
	}
	if len(operations) == 0 || selected[strings.ToLower("HasBlob")] {
		o.HasBlob = m.HasBlob
	}
	if len(operations) == 0 || selected[strings.ToLower("Head")] {
		o.Head = m.Head
	}
	if len(operations) == 0 || selected[strings.ToLower("CommitSwap")] {
		o.CommitSwap = m.CommitSwap
	}
	if len(operations) == 0 || selected[strings.ToLower("Headers")] {
		o.Headers = m.Headers
	}
	if len(operations) == 0 || selected[strings.ToLower("Header")] {
		o.Header = m.Header
	}
	if len(operations) == 0 || selected[strings.ToLower("Entries")] {
		o.Entries = m.Entries
	}
	if len(operations) == 0 || selected[strings.ToLower("FileList")] {
		o.FileList = m.FileList
	}
	if len(operations) == 0 || selected[strings.ToLower("State")] {
		o.State = m.State
	}
	if len(operations) == 0 || selected[strings.ToLower("States")] {
		o.States = m.States
	}
	if len(operations) == 0 || selected[strings.ToLower("WriteState")] {
		o.WriteState = m.WriteState
	}
	if len(operations) == 0 || selected[strings.ToLower("Device")] {
		o.Device = m.Device
	}
	if len(operations) == 0 || selected[strings.ToLower("PutDevice")] {
		o.PutDevice = m.PutDevice
	}
	if len(operations) == 0 || selected[strings.ToLower("PutBlob")] {
		o.PutBlob = m.PutBlob
	}
	if len(operations) == 0 || selected[strings.ToLower("GetBlob")] {
		o.GetBlob = m.GetBlob
	}
	if len(operations) == 0 || selected[strings.ToLower("BlobHashes")] {
		o.BlobHashes = m.BlobHashes
	}
	if len(operations) == 0 || selected[strings.ToLower("VaultUsage")] {
		o.VaultUsage = m.VaultUsage
	}
	if len(operations) == 0 || selected[strings.ToLower("Prune")] {
		o.Prune = m.Prune
	}
	if len(operations) == 0 || selected[strings.ToLower("SetupToken")] {
		o.SetupToken = m.SetupToken
	}
	if len(operations) == 0 || selected[strings.ToLower("SetSetupToken")] {
		o.SetSetupToken = m.SetSetupToken
	}
	if len(operations) == 0 || selected[strings.ToLower("PutSession")] {
		o.PutSession = m.PutSession
	}
	if len(operations) == 0 || selected[strings.ToLower("Session")] {
		o.Session = m.Session
	}
	if len(operations) == 0 || selected[strings.ToLower("ConsumeSession")] {
		o.ConsumeSession = m.ConsumeSession
	}
	if len(operations) == 0 || selected[strings.ToLower("Charge")] {
		o.Charge = m.Charge
	}
	if len(operations) == 0 || selected[strings.ToLower("Refund")] {
		o.Refund = m.Refund
	}
	if len(operations) == 0 || selected[strings.ToLower("OpenMailbox")] {
		o.OpenMailbox = m.OpenMailbox
	}
	if len(operations) == 0 || selected[strings.ToLower("Mailbox")] {
		o.Mailbox = m.Mailbox
	}
	if len(operations) == 0 || selected[strings.ToLower("WriteMailbox")] {
		o.WriteMailbox = m.WriteMailbox
	}
	if len(operations) == 0 || selected[strings.ToLower("CloseMailbox")] {
		o.CloseMailbox = m.CloseMailbox
	}
	if len(operations) == 0 || selected[strings.ToLower("Approver")] {
		o.Approver = m.Approver
	}
	if len(operations) == 0 || selected[strings.ToLower("RememberNonce")] {
		o.RememberNonce = m.RememberNonce
	}
	return s.CreateFakeStorageAdapter(o)
}
