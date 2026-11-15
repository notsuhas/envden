package persistence

import (
	"context"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

var mailboxPattern = regexp.MustCompile(`^[1-9]\d{0,2}$`)

func IsStaleSwapError(err error) bool {
	return errors.Is(err, errors.HeadMoved) || errors.Is(err, errors.Unauthorized)
}

func SaveApproval(a contracts.Adapters, mailbox int, raw []byte) error {
	return files.AtomicWrite(filepath.Join(a.Home, "state", "pair-swap"), []byte(strconv.Itoa(mailbox)+":"+client.Text(raw)), a.Now)
}

func SubmitApproval(ctx context.Context, a contracts.Adapters, cl *client.Client, vaultID []byte) (bool, error) {
	path := filepath.Join(a.Home, "state", "pair-swap")
	saved, err := files.OptionalRead(path)
	if err != nil || saved == nil || *saved == "" {
		return false, err
	}

	parts := strings.Split(*saved, ":")
	if len(parts) < 2 || !mailboxPattern.MatchString(parts[0]) || parts[1] == "" {
		return false, errors.New(errors.InvalidData, "Invalid stored pairing swap")
	}

	raw, err := client.Binary(parts[1])
	if err != nil {
		return false, err
	}

	swap, err := encoding.Decode(manifests.SwapCodec, raw)
	if err != nil {
		return false, err
	}

	hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, swap.Header, "manifest")
	if err != nil {
		return false, err
	}

	history, err := vault.ReadHistory(ctx, cl, vaultID, nil)
	if err != nil {
		return false, err
	}

	if !vault.HistoryHasHeader(history, hash) {
		response, err := cl.Request(ctx, "/v1/swap?mailbox="+parts[0], "POST", raw)
		if err != nil {
			return false, err
		}

		_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	}

	history, err = vault.ReadHistory(ctx, cl, vaultID, nil)
	if err != nil {
		return false, err
	}

	if !vault.HistoryHasHeader(history, hash) {
		return false, errors.New(errors.InvalidData, "Server did not commit the pairing swap")
	}

	return true, Remove(path)
}

func ResumeApproval(ctx context.Context, a contracts.Adapters, cl *client.Client, vaultID []byte) (bool, error) {
	result, err := SubmitApproval(ctx, a, cl, vaultID)
	if !IsStaleSwapError(err) {
		return result, err
	}

	if e := Remove(filepath.Join(a.Home, "state", "pair-swap")); e != nil {
		return false, e
	}

	return false, errors.Wrap(errors.Conflict, "Pairing approval expired; run envden device add again", err)
}
