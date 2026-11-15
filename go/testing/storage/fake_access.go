package storage

import "github.com/notsuhas/envden/go/core/adapters"

func (f *fake) PutSession(vaultID []byte, key adapters.SessionKey, bytes []byte, now int64) error {
	if f.operations.PutSession == nil {
		panic("Unexpected fake operation: storage.putSession")
	}

	return f.operations.PutSession(vaultID, key, bytes, now)
}

func (f *fake) Session(vaultID []byte, key adapters.SessionKey, now int64) ([]byte, error) {
	if f.operations.Session == nil {
		panic("Unexpected fake operation: storage.session")
	}

	return f.operations.Session(vaultID, key, now)
}

func (f *fake) ConsumeSession(vaultID []byte, key adapters.SessionKey, now int64) ([]byte, error) {
	if f.operations.ConsumeSession == nil {
		panic("Unexpected fake operation: storage.consumeSession")
	}

	return f.operations.ConsumeSession(vaultID, key, now)
}

func (f *fake) Charge(vaultID []byte, bucket adapters.RateBucket, now int64) (adapters.RateCharge, error) {
	if f.operations.Charge == nil {
		panic("Unexpected fake operation: storage.charge")
	}

	return f.operations.Charge(vaultID, bucket, now)
}

func (f *fake) Refund(receipt string, now int64) (bool, error) {
	if f.operations.Refund == nil {
		panic("Unexpected fake operation: storage.refund")
	}

	return f.operations.Refund(receipt, now)
}

func (f *fake) OpenMailbox(vaultID, device []byte, now int64) (*adapters.StoredMailbox, error) {
	if f.operations.OpenMailbox == nil {
		panic("Unexpected fake operation: storage.openMailbox")
	}

	return f.operations.OpenMailbox(vaultID, device, now)
}

func (f *fake) Mailbox(vaultID []byte, number int, now int64) (*adapters.StoredMailbox, error) {
	if f.operations.Mailbox == nil {
		panic("Unexpected fake operation: storage.mailbox")
	}

	return f.operations.Mailbox(vaultID, number, now)
}

func (f *fake) WriteMailbox(vaultID []byte, number int, slot adapters.MailboxSlot, bytes []byte, now int64) (adapters.MailboxWrite, error) {
	if f.operations.WriteMailbox == nil {
		panic("Unexpected fake operation: storage.writeMailbox")
	}

	return f.operations.WriteMailbox(vaultID, number, slot, bytes, now)
}

func (f *fake) CloseMailbox(vaultID []byte, number int) error {
	if f.operations.CloseMailbox == nil {
		panic("Unexpected fake operation: storage.closeMailbox")
	}

	return f.operations.CloseMailbox(vaultID, number)
}

func (f *fake) Approver(vaultID, device []byte, now int64) ([]byte, error) {
	if f.operations.Approver == nil {
		panic("Unexpected fake operation: storage.approver")
	}

	return f.operations.Approver(vaultID, device, now)
}

func (f *fake) RememberNonce(device, nonce []byte, now int64) (bool, error) {
	if f.operations.RememberNonce == nil {
		panic("Unexpected fake operation: storage.rememberNonce")
	}

	return f.operations.RememberNonce(device, nonce, now)
}
