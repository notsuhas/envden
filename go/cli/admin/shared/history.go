package shared

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type History = vault.History

func ReadHistory(ctx context.Context, c *client.Client, id []byte) (History, error) {
	return vault.ReadHistory(ctx, c, id, nil)
}

func CheckFloor(local *model.State, history History) error {
	for _, encoded := range local.Headers {
		raw, err := client.Binary(encoded)
		if err != nil {
			return err
		}
		stored, err := b.Decode(b.SignedCodec(m.ManifestHeaderCodec), raw)
		if err != nil {
			return err
		}
		var remote *b.Signed[m.ManifestHeader]
		for i := range history.Headers {
			if history.Headers[i].Body.Seq == stored.Body.Seq {
				remote = &history.Headers[i]
				break
			}
		}
		if remote == nil {
			return errors.New(errors.Rollback, "Server is behind this device; run envden server repair")
		}
		if !b.Equal(HeaderHash(stored), HeaderHash(*remote)) {
			return errors.New(errors.Fork, "Server history conflicts with stored headers")
		}
	}
	return nil
}

func HeaderHash(h b.Signed[m.ManifestHeader]) []byte {
	return b.Must(crypto.ObjectHash(m.ManifestHeaderCodec, h, "manifest"))
}
func EntryHash(e b.Signed[c.Entry]) []byte {
	return b.Must(crypto.ObjectHash(c.EntryCodec, e, "entry"))
}

func CurrentHistory(ctx context.Context, c *Context) (History, error) {
	h, err := ReadHistory(ctx, c.Client, c.VaultID)
	if err == nil {
		err = CheckFloor(c.Local, h)
	}
	return h, err
}
