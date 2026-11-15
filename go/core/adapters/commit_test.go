package adapters

import (
	"reflect"
	"testing"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

type commitFake struct {
	token, session []byte
	box            *StoredMailbox
	exists         bool
	calls          []string
	writes         []StateWrite
	devices        []StoredDeviceState
}

func (f *commitFake) SetupToken() ([]byte, error) {
	f.calls = append(f.calls, "token")

	return f.token, nil
}

func (f *commitFake) ConsumeSession([]byte, SessionKey, int64) ([]byte, error) {
	f.calls = append(f.calls, "session")

	return f.session, nil
}

func (f *commitFake) Mailbox([]byte, int, int64) (*StoredMailbox, error) {
	f.calls = append(f.calls, "mailbox")

	return f.box, nil
}

func (f *commitFake) ConfigureVault([]byte, StoredVault, []StateWrite, []byte) error {
	f.calls = append(f.calls, "configure")
	f.exists = true

	return nil
}

func (f *commitFake) HasVault([]byte) (bool, error) {
	f.calls = append(f.calls, "has")

	return f.exists, nil
}

func (f *commitFake) WriteState(_ []byte, w []StateWrite) error {
	f.calls = append(f.calls, "state")
	f.writes = w

	return nil
}

func (f *commitFake) PutDevice(_ []byte, id []byte, s StoredDevice) error {
	f.calls = append(f.calls, "device")
	f.devices = append(f.devices, StoredDeviceState{ID: id, State: s})

	return nil
}

func TestCommitPreconditions(t *testing.T) {
	n := 1
	for _, row := range []struct {
		swap StoredSwap
		code enverrors.Code
	}{{StoredSwap{SetupTokenHash: make([]byte, 32)}, enverrors.Unauthorized}, {StoredSwap{ConsumeSessions: []SessionKey{{Kind: SessionLogin, Purpose: "test", Device: make([]byte, 16)}}}, enverrors.Unauthorized}, {StoredSwap{CloseMailbox: &n}, enverrors.NotFound}, {StoredSwap{}, enverrors.InvalidData}} {
		if err := PrepareCommit(&commitFake{}, nil, row.swap, 0); !enverrors.Is(err, row.code) {
			t.Fatal(err, row.code)
		}
	}
}

func TestCommitOrderAndWrites(t *testing.T) {
	n := 0
	f := &commitFake{token: []byte{1}, session: []byte{}, box: &StoredMailbox{}}
	swap := StoredSwap{SetupTokenHash: []byte{1}, ConsumeSessions: []SessionKey{{}}, CloseMailbox: &n, Vault: &StoredVault{}, State: []StateWrite{{Kind: StateKeyring, Bytes: []byte{2}}}, Devices: []StoredDeviceState{{ID: []byte{3}}}}
	if err := PrepareCommit(f, nil, swap, 42); err != nil {
		t.Fatal(err)
	}
	if err := WriteCommitState(f, nil, swap); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(f.calls, []string{"token", "session", "mailbox", "configure", "has", "state", "device"}) || !reflect.DeepEqual(f.writes, swap.State) || !reflect.DeepEqual(f.devices, swap.Devices) {
		t.Fatal(f)
	}
}
