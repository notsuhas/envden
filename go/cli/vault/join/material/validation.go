package material

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"io"
)

func JoinMembership(history vault.History, id, pin, hash []byte) (b.Signed[m.ManifestHeader], *devices.State, error) {
	var header *b.Signed[m.ManifestHeader]
	for _, h := range history.Headers {
		v, err := c.ObjectHash(m.ManifestHeaderCodec, h, "manifest")
		if err != nil {
			return b.Signed[m.ManifestHeader]{}, nil, err
		}
		if b.Equal(v, hash) {
			header = &h
			break
		}
	}
	_, member := history.State.Devices[b.Base32(id)]
	if header == nil || !b.Equal(history.State.ServerPin, pin) || !member {
		return b.Signed[m.ManifestHeader]{}, nil, errors.New(errors.InvalidData, "Pairing membership verification failed")
	}
	entries := []b.Signed[p.Entry]{}
	for _, v := range history.Entries {
		if v.Body.Seq <= header.Body.ListSeq {
			entries = append(entries, v)
		}
	}
	at, err := devices.VerifyChain(entries)
	if err != nil {
		return *header, nil, err
	}
	if at.Kind != "valid" || !b.Equal(at.State.ServerPin, pin) {
		return *header, nil, errors.New(errors.InvalidData, "Device was not added at the approved checkpoint")
	}
	if _, ok := at.State.Devices[b.Base32(id)]; !ok {
		return *header, nil, errors.New(errors.InvalidData, "Device was not added at the approved checkpoint")
	}
	return *header, at.State, nil
}

func RequireLocalFloor(h vault.History, checkpoint string) error {
	if checkpoint == "" {
		return nil
	}
	raw, err := client.Binary(checkpoint)
	if err != nil {
		return err
	}
	if !vault.HistoryHasHeader(h, raw) {
		return errors.New(errors.Fork, "Joined history does not descend from the local checkpoint")
	}
	return nil
}

func VerifiedBlob(ctx context.Context, cl *client.Client, resource, label string, hash []byte) ([]byte, error) {
	response, err := cl.Request(ctx, "/v1/"+resource+"/"+client.Text(hash), "GET", nil)
	if err != nil {
		return nil, err
	}
	raw, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		return nil, err
	}
	if !b.Equal(c.H(label, raw), hash) {
		return nil, errors.New(errors.InvalidData, "Invalid join blob hash")
	}
	return raw, nil
}
