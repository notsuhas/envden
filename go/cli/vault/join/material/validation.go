package material

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func JoinMembership(history vault.History, id, pin, hash []byte) (encoding.Signed[manifests.ManifestHeader], *devices.State, error) {
	var header *encoding.Signed[manifests.ManifestHeader]
	for _, h := range history.Headers {
		v, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, h, "manifest")
		if err != nil {
			return encoding.Signed[manifests.ManifestHeader]{}, nil, err
		}

		if encoding.Equal(v, hash) {
			header = &h
			break
		}
	}

	_, member := history.State.Devices[encoding.Base32(id)]
	if header == nil || !encoding.Equal(history.State.ServerPin, pin) || !member {
		return encoding.Signed[manifests.ManifestHeader]{}, nil, errors.New(errors.InvalidData, "Pairing membership verification failed")
	}

	entries := []encoding.Signed[codecs.Entry]{}
	for _, v := range history.Entries {
		if v.Body.Seq <= header.Body.ListSeq {
			entries = append(entries, v)
		}
	}

	at, err := devices.VerifyChain(entries)
	if err != nil {
		return *header, nil, err
	}

	if at.Kind != "valid" || !encoding.Equal(at.State.ServerPin, pin) {
		return *header, nil, errors.New(errors.InvalidData, "Device was not added at the approved checkpoint")
	}

	if _, ok := at.State.Devices[encoding.Base32(id)]; !ok {
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
	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	if err != nil {
		return nil, err
	}

	if !encoding.Equal(crypto.H(label, raw), hash) {
		return nil, errors.New(errors.InvalidData, "Invalid join blob hash")
	}

	return raw, nil
}
