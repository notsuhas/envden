package recovery

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/textcase"
)

type KitInput struct {
	VaultID   string `json:"vaultId"`
	SecretKey string `json:"secretKey"`
}

func SecretKeyProblem(value string) string {
	raw, err := keys.DecodeSecretKey(textcase.Trim(value))
	if err == nil && len(raw) == 16 {
		return ""
	}

	return "Not a secret key. Copy the EK1-… line from your recovery kit"
}

func VaultIDProblem(value string) string {
	raw, err := encoding.Unbase32(textcase.Trim(value))
	if err == nil && len(raw) == 32 {
		return ""
	}

	return "Not a vault ID. Copy it from your recovery kit"
}

func ParseKit(text string) (KitInput, error) {
	var fields map[string]json.RawMessage
	var kit KitInput
	if json.Unmarshal([]byte(text), &fields) == nil {
		_ = json.Unmarshal(fields["vaultId"], &kit.VaultID)
		_ = json.Unmarshal(fields["secretKey"], &kit.SecretKey)
	}
	if VaultIDProblem(kit.VaultID) != "" || SecretKeyProblem(kit.SecretKey) != "" {
		return KitInput{}, errors.New(errors.InvalidInput, "Not a recovery kit file")
	}

	kit.VaultID = textcase.Trim(kit.VaultID)
	kit.SecretKey = textcase.Trim(kit.SecretKey)

	return kit, nil
}
