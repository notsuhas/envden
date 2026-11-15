package sqlite

import "github.com/notsuhas/envden/go/core/adapters"

func (s *storage) PutSession(vaultID []byte, key adapters.SessionKey, bytes []byte, now int64) (err error) {
	defer recoverError(&err)
	s.putSession(vaultID, key, bytes, now)
	return nil
}

func (s *storage) Session(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	defer recoverError(&err)
	return s.session(vaultID, key, now), nil
}

func (s *storage) ConsumeSession(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	defer recoverError(&err)
	return s.consumeSession(vaultID, key, now), nil
}

func (s *storage) Charge(vaultID []byte, bucket adapters.RateBucket, now int64) (result adapters.RateCharge, err error) {
	defer recoverError(&err)
	return s.charge(vaultID, bucket, now), nil
}

func (s *storage) Refund(receipt string, now int64) (result bool, err error) {
	defer recoverError(&err)
	return s.refund(receipt, now), nil
}

func (s *storage) OpenMailbox(vaultID, device []byte, now int64) (result *adapters.StoredMailbox, err error) {
	defer recoverError(&err)
	return s.openMailbox(vaultID, device, now), nil
}

func (s *storage) Mailbox(vaultID []byte, number int, now int64) (result *adapters.StoredMailbox, err error) {
	defer recoverError(&err)
	return s.mailbox(vaultID, number, now), nil
}

func (s *storage) WriteMailbox(vaultID []byte, number int, slot adapters.MailboxSlot, bytes []byte, now int64) (result adapters.MailboxWrite, err error) {
	defer recoverError(&err)
	return s.writeMailbox(vaultID, number, slot, bytes, now), nil
}

func (s *storage) CloseMailbox(vaultID []byte, number int) (err error) {
	defer recoverError(&err)
	s.closeMailbox(vaultID, number)
	return nil
}

func (s *storage) Approver(vaultID, device []byte, now int64) (result []byte, err error) {
	defer recoverError(&err)
	return s.approver(vaultID, device, now), nil
}

func (s *storage) RememberNonce(device, nonce []byte, now int64) (result bool, err error) {
	defer recoverError(&err)
	return s.rememberNonce(device, nonce, now), nil
}
