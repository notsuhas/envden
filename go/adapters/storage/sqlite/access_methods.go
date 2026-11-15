package sqlite

import "github.com/notsuhas/envden/go/core/adapters"

func (s *storage) PutSession(vaultID []byte, key adapters.SessionKey, bytes []byte, now int64) (err error) {
	return s.putSession(vaultID, key, bytes, now)
}

func (s *storage) Session(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	return s.session(vaultID, key, now)
}

func (s *storage) ConsumeSession(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	return s.consumeSession(vaultID, key, now)
}

func (s *storage) Charge(vaultID []byte, bucket adapters.RateBucket, now int64) (result adapters.RateCharge, err error) {
	return s.charge(vaultID, bucket, now)
}

func (s *storage) Refund(receipt string, now int64) (result bool, err error) {
	return s.refund(receipt, now)
}

func (s *storage) OpenMailbox(vaultID, device []byte, now int64) (result *adapters.StoredMailbox, err error) {
	return s.openMailbox(vaultID, device, now)
}

func (s *storage) Mailbox(vaultID []byte, number int, now int64) (result *adapters.StoredMailbox, err error) {
	return s.mailbox(vaultID, number, now)
}

func (s *storage) WriteMailbox(vaultID []byte, number int, slot adapters.MailboxSlot, bytes []byte, now int64) (result adapters.MailboxWrite, err error) {
	return s.writeMailbox(vaultID, number, slot, bytes, now)
}

func (s *storage) CloseMailbox(vaultID []byte, number int) (err error) {
	return s.closeMailbox(vaultID, number)
}

func (s *storage) Approver(vaultID, device []byte, now int64) (result []byte, err error) {
	return s.approver(vaultID, device, now)
}

func (s *storage) RememberNonce(device, nonce []byte, now int64) (result bool, err error) {
	return s.rememberNonce(device, nonce, now)
}
