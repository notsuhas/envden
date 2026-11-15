package checkout

import (
	"crypto/sha256"
	"encoding/base64"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	syncfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"os"
)

func RemoveCheckoutBases(home string, removed, remaining []model.Link, now func() int64) error {
	for _, link := range removed {
		base := syncfiles.BasePath(home, link.Store)
		pending, err := operation.ReadOperation(base+".pending", now, nil)
		if err != nil {
			return err
		}
		if pending != nil && pending.Entry != nil && *pending.Entry != "" {
			var next []byte
			if pending.Next != nil {
				next, err = base64.StdEncoding.DecodeString(*pending.Next)
				if err != nil {
					return err
				}
			}
			stored, err := syncfiles.ReadBytes(link.Store)
			if err != nil {
				return err
			}
			if (next == nil) == (stored == nil) && sha256.Sum256(next) == sha256.Sum256(stored) {
				if err := files.AtomicWrite(base+".entry", []byte(*pending.Entry), now); err != nil {
					return err
				}
			}
		}
		paths := []string{base + ".pending", syncfiles.BasePath(home, link.Store, link.Root)}
		found := false
		for _, other := range remaining {
			if other.Store == link.Store {
				found = true
				break
			}
		}
		if !found {
			paths = append(paths, base, base+".corrupt")
		}
		for _, path := range paths {
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	return nil
}
