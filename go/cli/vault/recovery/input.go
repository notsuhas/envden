package recovery

import (
	"encoding/json"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type KitInput struct {
	VaultID   string `json:"vaultId"`
	SecretKey string `json:"secretKey"`
}

func SecretKeyProblem(value string) string {
	raw, err := keys.DecodeSecretKey(strings.TrimSpace(value))
	if err == nil && len(raw) == 16 {
		return ""
	}

	return "Not a secret key. Copy the EK1-… line from your recovery kit"
}

func VaultIDProblem(value string) string {
	raw, err := encoding.Unbase32(strings.TrimSpace(value))
	if err == nil && len(raw) == 32 {
		return ""
	}

	return "Not a vault ID. Copy it from your recovery kit"
}

func ParseKit(text string) (KitInput, error) {
	var kit KitInput
	if json.Unmarshal([]byte(text), &kit) != nil || VaultIDProblem(kit.VaultID) != "" || SecretKeyProblem(kit.SecretKey) != "" {
		return KitInput{}, errors.New(errors.InvalidInput, "Not a recovery kit file")
	}

	kit.VaultID = strings.TrimSpace(kit.VaultID)
	kit.SecretKey = strings.TrimSpace(kit.SecretKey)

	return kit, nil
}
