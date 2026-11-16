package local

import (
	"encoding/base64"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/records"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func AppliedFiles(home string) (jsonvalue.Object, error) {
	value, err := records.ReadSyncRecord(filepath.Join(home, "state", "applied-files.json"), func(saved string) (jsonvalue.Object, error) {
		parsed, err := jsonvalue.Parse([]byte(saved))
		if err != nil {
			return nil, err
		}
		obj, ok := parsed.(jsonvalue.Object)
		if !ok {
			return nil, e.New(e.InvalidData, "Invalid applied files")
		}
		for _, field := range obj {
			text, ok := field.Value.(string)
			if !ok {
				return nil, e.New(e.InvalidData, "Invalid applied files")
			}
			raw, err := base64.RawURLEncoding.DecodeString(text)
			if err != nil {
				return nil, err
			}
			if _, err = b.Decode(m.FileEntryCodec, raw); err != nil {
				return nil, err
			}
		}

		return obj, nil
	})
	if value == nil {
		return jsonvalue.Object{}, err
	}

	return *value, err
}

func SaveAppliedFiles(home string, value jsonvalue.Object, now func() int64, writes ...func(string, []byte) error) error {
	path := filepath.Join(home, "state", "applied-files.json")
	raw, err := jsonvalue.Marshal(value)
	if err != nil {
		return err
	}
	old, err := sf.OptionalRead(path)
	if err != nil {
		return err
	}
	if old != nil && *old == string(raw) {
		return nil
	}

	if len(writes) > 0 && writes[0] != nil {
		return writes[0](path, raw)
	}

	return sf.AtomicWrite(path, raw, now)
}

func HasAppliedEntry(entry m.FileEntry, applied jsonvalue.Object) bool {
	return applied.Get(b.Base32(entry.FileId)) == base64.RawURLEncoding.EncodeToString(m.FileEntryCodec.Write(entry))
}

func MarkAppliedEntry(home, encoded, store string, now func() int64, writes ...func(string, []byte) error) error {
	if store != "" {
		if err := sf.AtomicWrite(f.BasePath(home, store)+".entry", []byte(encoded), now); err != nil {
			return err
		}
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return err
	}
	entry, err := b.Decode(m.FileEntryCodec, raw)
	if err != nil {
		return err
	}
	applied, err := AppliedFiles(home)
	if err != nil {
		return err
	}
	applied.Set(b.Base32(entry.FileId), encoded)

	return SaveAppliedFiles(home, applied, now, writes...)
}
