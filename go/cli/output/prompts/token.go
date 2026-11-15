package prompts

import (
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"io"
	"strings"
)

func ReadToken(kind string, value *string, source io.Reader, interactive bool) (string, error) {
	if interactive && value == nil {
		label := "Server setup token"
		if kind == "repair" {
			label = "Repair token"
		}
		return Secret(label, func(v string) string {
			if _, e := proofs.DecodeToken(kind, v); e != nil {
				return "Not a " + kind + " token"
			}
			return ""
		})
	}
	token := ""
	if value != nil {
		token = *value
	} else {
		raw, e := io.ReadAll(source)
		if e != nil {
			return "", e
		}
		token = strings.TrimSpace(string(raw))
		if token == "" {
			return "", errors.New(errors.InvalidInput, "Provide the token on stdin or use the prompt in a terminal")
		}
	}
	_, e := proofs.DecodeToken(kind, token)
	return token, e
}
