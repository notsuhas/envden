package memory

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
)

type timed struct {
	Bytes   []byte
	Expires int64
}

type blob struct {
	Vault       string
	Hash, Bytes []byte
	At          int64
}

type list struct {
	Vault     string
	Files     adapters.StoredFiles
	At        int64
	Permanent bool
}

type state struct {
	Vault      string
	Kind       adapters.StateKind
	Key, Bytes []byte
}

type box struct {
	Vault string
	Box   adapters.StoredMailbox
}

type bucket struct {
	Until   int64
	Strikes int
}

type charge struct {
	Key string
	At  int64
}

type data struct {
	Vaults              map[string]adapters.StoredVault
	Heads               map[string][]byte
	Headers, Entries    map[string][]adapters.StoredHeader
	Digests             map[string]bool
	Lists               map[string]list
	CurrentFiles        map[string]string
	States              map[string]state
	Devices             map[string]adapters.StoredDevice
	Blobs               map[string]blob
	Setup               []byte
	Sessions, Approvers map[string]timed
	Nonces              map[string]int64
	Mailboxes           map[int]box
	Openings            map[string][]int64
	Buckets             map[string]bucket
	Charges             map[string]charge
	Receipt             int
	Order               map[string][]string
}

type memory struct {
	data  data
	depth int
}

func newData() data {
	return data{Vaults: map[string]adapters.StoredVault{}, Heads: map[string][]byte{}, Headers: map[string][]adapters.StoredHeader{}, Entries: map[string][]adapters.StoredHeader{}, Digests: map[string]bool{}, Lists: map[string]list{}, CurrentFiles: map[string]string{}, States: map[string]state{}, Devices: map[string]adapters.StoredDevice{}, Blobs: map[string]blob{}, Sessions: map[string]timed{}, Approvers: map[string]timed{}, Nonces: map[string]int64{}, Mailboxes: map[int]box{}, Openings: map[string][]int64{}, Buckets: map[string]bucket{}, Charges: map[string]charge{}, Order: map[string][]string{}}
}

func clone[T any](v T) T {
	b, e := json.Marshal(v)
	must(e)
	var out T
	must(json.Unmarshal(b, &out))

	return out
}

func hexKey(b []byte) string { return hex.EncodeToString(b) }

func pair(v, k []byte) string { return hexKey(v) + ":" + hexKey(k) }

func must(e error) {
	if e != nil {
		panic(e)
	}
}

func recoverError(e *error) {
	if v := recover(); v != nil {
		if err, ok := v.(error); ok {
			*e = err
		} else {
			panic(v)
		}
	}
}

func fail(text string) { panic(errors.New(text)) }

func same(a, b []byte) bool { return (a == nil) == (b == nil) && bytes.Equal(a, b) }

func (m *memory) tx(fn func()) {
	before := clone(m.data)
	m.depth++
	defer func() {
		m.depth--
		if v := recover(); v != nil {
			m.data = before
			panic(v)
		}
	}()
	fn()
}

func (m *memory) ordered(kind, key string) {
	for _, k := range m.data.Order[kind] {
		if k == key {
			return
		}
	}
	m.data.Order[kind] = append(m.data.Order[kind], key)
}

func deletePrefix[T any](values map[string]T, prefix string) {
	for k := range values {
		if strings.HasPrefix(k, prefix) {
			delete(values, k)
		}
	}
}

func (m *memory) forget(kind, key string) {
	keys := m.data.Order[kind]
	for i, k := range keys {
		if k == key {
			m.data.Order[kind] = append(keys[:i], keys[i+1:]...)

			return
		}
	}
}
