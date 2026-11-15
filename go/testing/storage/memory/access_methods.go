package memory

import "github.com/notsuhas/envden/go/core/adapters"

func (m *memory) PutSession(vaultID []byte, key adapters.SessionKey, bytes []byte, now int64) (err error) {
	defer recoverError(&err)
	m.putSession(vaultID, key, bytes, now)

	return nil
}

func (m *memory) Session(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	defer recoverError(&err)

	return m.session(vaultID, key, now), nil
}

func (m *memory) ConsumeSession(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	defer recoverError(&err)

	return m.consumeSession(vaultID, key, now), nil
}

func (m *memory) Charge(vaultID []byte, bucket adapters.RateBucket, now int64) (result adapters.RateCharge, err error) {
	defer recoverError(&err)

	return m.charge(vaultID, bucket, now), nil
}

func (m *memory) Refund(receipt string, now int64) (result bool, err error) {
	defer recoverError(&err)

	return m.refund(receipt, now), nil
}

func (m *memory) OpenMailbox(vaultID, device []byte, now int64) (result *adapters.StoredMailbox, err error) {
	defer recoverError(&err)

	return m.openMailbox(vaultID, device, now), nil
}

func (m *memory) Mailbox(vaultID []byte, number int, now int64) (result *adapters.StoredMailbox, err error) {
	defer recoverError(&err)

	return m.mailbox(vaultID, number, now), nil
}

func (m *memory) WriteMailbox(vaultID []byte, number int, slot adapters.MailboxSlot, bytes []byte, now int64) (result adapters.MailboxWrite, err error) {
	defer recoverError(&err)

	return m.writeMailbox(vaultID, number, slot, bytes, now), nil
}

func (m *memory) CloseMailbox(vaultID []byte, number int) (err error) {
	defer recoverError(&err)
	m.closeMailbox(vaultID, number)

	return nil
}

func (m *memory) Approver(vaultID, device []byte, now int64) (result []byte, err error) {
	defer recoverError(&err)

	return m.approver(vaultID, device, now), nil
}

func (m *memory) RememberNonce(device, nonce []byte, now int64) (result bool, err error) {
	defer recoverError(&err)

	return m.rememberNonce(device, nonce, now), nil
}
