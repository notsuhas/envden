package client

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"io"
	"net/http"
	"strings"
)

var messages = map[errors.Code]string{
	errors.Code("INVALID_INPUT"):         "Server rejected the request. Update envden and try again",
	errors.Code("INVALID_DATA"):          "Server rejected the data. Update envden and try again",
	errors.Code("UPDATE_REQUIRED"):       "Server uses a newer format. Update envden",
	errors.Code("ROLLBACK"):              "Server is behind this device. Run envden server repair",
	errors.Code("FORK"):                  "Server history conflicts with this device. Run envden server repair",
	errors.Code("NOT_MEMBER"):            "This device was removed from the vault. Run envden join to rejoin",
	errors.Code("UNAUTHORIZED"):          "Server rejected this device's signature. Check the system clock and try again",
	errors.Code("LOCKED"):                "Unlock expired. Run envden unlock",
	errors.Code("RECOVERY_KIT_REQUIRED"): "Replace the recovery kit first. Run envden vault kit replace",
	errors.Code("STORAGE_QUOTA"):         "Vault storage on the server is full. Remove files with envden rm, or ask the server owner for more space",
	errors.Code("RATE_LIMITED"):          "Too many attempts. Wait 15 minutes and try again",
	errors.Code("CONFLICT"):              "Server state changed during the request. Run the command again",
	errors.Code("NOT_FOUND"):             "Server doesn't know this vault. Check the server address with envden status",
	errors.Code("HEAD_MOVED"):            "Another device changed the vault. Run the command again",
	errors.Code("RESTORED_MODE"):         "Server was restored from a backup. Run envden server repair",
	errors.Code("MOVING"):                "Vault is moving to another server. Try again when the move finishes",
	errors.Code("SERVER_TOO_OLD"):        "Server is too old for this envden. Update the server",
	errors.Code("CLIENT_TOO_OLD"):        "This envden is too old for the server. Update envden",
	errors.Code("NOT_IMPLEMENTED"):       "Server doesn't support this yet. Update the server",
	errors.Code("INTERNAL"):              "Server hit an internal error. Check the server logs",
	errors.Code("SERVER_UNREACHABLE"):    "Server can't reach its storage. Try again later",
	errors.Code("BUSY"):                  "Server is busy. Try again in a minute",
}

func ResponseError(response *http.Response, path string) error {
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return errors.New(errors.InvalidData, "Invalid server response")
	}
	var head struct{ Kind string }
	if json.Unmarshal(raw, &head) == nil && head.Kind == "head-moved" {
		return errors.New(errors.HeadMoved, messages[errors.HeadMoved])
	}
	parsed, err := p.ErrorResponseSchema.Decode(raw)
	if err != nil {
		return errors.New(errors.InvalidData, "Invalid server response")
	}
	code := errors.Code(parsed.Error)
	message := messages[code]
	if strings.HasPrefix(path, "/v1/pairing/") && (code == errors.NotFound || code == errors.Conflict || code == errors.Unauthorized) {
		message = "Pairing code expired or already used. Run envden device add for a new one"
	}
	if strings.HasPrefix(path, "/v1/opaque/login/") && code == errors.Unauthorized {
		message = "Login expired or the vault moved. Check the server address and try again"
	}
	return errors.New(code, message)
}
