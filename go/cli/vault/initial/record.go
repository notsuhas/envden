package initial

import (
	"crypto/sha256"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"path/filepath"
)

func basePath(home string, link model.Link) string {
	value := link.Store
	if link.Mode == "copy" {
		value += "\x00" + link.Root
	}
	hash := sha256.Sum256([]byte(value))
	return filepath.Join(home, "base", b.Base32(hash[:]))
}

func recordPushed(home string, list m.Files, bases map[string][]byte, now func() int64) error {
	path := filepath.Join(home, "state", "applied-files.json")
	saved, err := files.OptionalRead(path)
	if err != nil {
		return err
	}
	applied := jsonvalue.Object{}
	if saved != nil {
		value, err := jsonvalue.Parse([]byte(*saved))
		if err != nil {
			return err
		}
		applied = value.(jsonvalue.Object)
	}
	for _, entry := range list.Entries {
		applied.Set(b.Base32(entry.FileId), client.Text(m.FileEntryCodec.Write(entry)))
	}
	raw, err := jsonvalue.Marshal(applied)
	if err != nil {
		return err
	}
	if err = files.AtomicWrite(path, raw, now); err != nil {
		return err
	}
	for path, data := range bases {
		if err = files.AtomicWrite(path, data, now); err != nil {
			return err
		}
	}
	return nil
}
