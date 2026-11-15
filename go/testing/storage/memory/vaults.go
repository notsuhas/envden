package memory

import (
	"github.com/notsuhas/envden/go/core/adapters"
	"strings"
)

func (m *memory) ID() string { return "memory" }

func (m *memory) Close() error { return nil }

func (m *memory) Transaction(fn func() error) (err error) {
	defer recoverError(&err)
	m.tx(func() { must(fn()) })
	return nil
}

func (m *memory) vaultIDs() [][]byte {
	out := [][]byte{}
	for _, key := range m.data.Order["vaults"] {
		if _, ok := m.data.Vaults[key]; ok {
			b, _ := hexDecode(key)
			out = append(out, b)
		}
	}
	return out
}

func (m *memory) capUnlocks(v []byte, until int64) {
	for k, d := range m.data.Devices {
		if strings.HasPrefix(k, hexKey(v)+":") {
			d.UnlockedUntil = min(d.UnlockedUntil, until)
			m.data.Devices[k] = d
		}
	}
}

func (m *memory) findCommitted(v, d []byte) bool { return m.data.Digests[pair(v, d)] }

func (m *memory) hasVault(v []byte) bool { _, ok := m.data.Vaults[hexKey(v)]; return ok }

func (m *memory) vault(v []byte) *adapters.StoredVault {
	row, ok := m.data.Vaults[hexKey(v)]
	if !ok {
		return nil
	}
	out := clone(row)
	return &out
}

func (m *memory) configureVault(v []byte, s adapters.StoredVault, w []adapters.StateWrite, token []byte) {
	m.tx(func() {
		if token != nil && (m.hasVault(v) || !same(m.data.Setup, token)) {
			fail("Setup token changed, consumed, or vault exists")
		}
		m.data.Vaults[hexKey(v)] = clone(s)
		m.ordered("vaults", hexKey(v))
		m.writeState(v, w)
		if token != nil {
			m.data.Setup = nil
		}
	})
}

func (m *memory) discardInactiveVault(v []byte) {
	state := m.vault(v)
	if state != nil && state.Active {
		fail("Cannot discard an active vault")
	}
	k := hexKey(v)
	delete(m.data.Vaults, k)
	m.forget("vaults", k)
	delete(m.data.Heads, k)
	delete(m.data.Headers, k)
	delete(m.data.Entries, k)
	delete(m.data.CurrentFiles, k)
	delete(m.data.Openings, k)
	for stateKey, entry := range m.data.States {
		if entry.Vault == k {
			m.forget("states", stateKey)
		}
	}
	for blobKey, entry := range m.data.Blobs {
		if entry.Vault == k {
			m.forget("blobs", blobKey)
		}
	}
	deletePrefix(m.data.Lists, k+":")
	deletePrefix(m.data.States, k+":")
	deletePrefix(m.data.Devices, k+":")
	deletePrefix(m.data.Blobs, k+":")
	deletePrefix(m.data.Approvers, k+":")
	deletePrefix(m.data.Digests, k+":")
	for sk := range m.data.Sessions {
		if strings.HasPrefix(sk, `["`+k+`",`) {
			delete(m.data.Sessions, sk)
		}
	}
	for n, b := range m.data.Mailboxes {
		if b.Vault == k {
			delete(m.data.Mailboxes, n)
		}
	}
}

func (m *memory) head(v []byte) []byte { return clone(m.data.Heads[hexKey(v)]) }

func (m *memory) state(v []byte, k adapters.StateKind, key []byte) []byte {
	return clone(m.data.States[hexKey(v)+":"+string(k)+":"+hexKey(key)].Bytes)
}

func (m *memory) states(v []byte, k adapters.StateKind) []adapters.StateEntry {
	out := []adapters.StateEntry{}
	for _, key := range m.data.Order["states"] {
		s, ok := m.data.States[key]
		if ok && s.Vault == hexKey(v) && s.Kind == k {
			out = append(out, adapters.StateEntry{Key: clone(s.Key), Bytes: clone(s.Bytes)})
		}
	}
	return out
}

func (m *memory) writeState(v []byte, writes []adapters.StateWrite) {
	for _, w := range writes {
		k := hexKey(v) + ":" + string(w.Kind) + ":" + hexKey(w.Key)
		if w.Bytes == nil {
			delete(m.data.States, k)
			m.forget("states", k)
		} else {
			m.data.States[k] = state{hexKey(v), w.Kind, clone(w.Key), clone(w.Bytes)}
			m.ordered("states", k)
		}
	}
}

func (m *memory) device(v, id []byte) *adapters.StoredDevice {
	s, ok := m.data.Devices[pair(v, id)]
	if !ok {
		return nil
	}
	out := clone(s)
	return &out
}

func (m *memory) putDevice(v, id []byte, s adapters.StoredDevice) {
	m.data.Devices[pair(v, id)] = clone(s)
}

func (m *memory) setupToken() []byte { return clone(m.data.Setup) }

func (m *memory) setSetupToken(b []byte) { m.data.Setup = clone(b) }
