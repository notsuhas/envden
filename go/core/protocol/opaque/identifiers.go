package opaque

import (
	"strconv"

	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Identifiers struct{ Client, Server string }

type IdentityContext struct {
	UserIdentifier string
	Identifiers    Identifiers
}

func checkIdentifiers(ids Identifiers) {
	encoding.RequireValue(ids.Client != "" && ids.Server != "", "Missing OPAQUE identifiers")
}

func checkUserIdentifier(id string) {
	encoding.RequireValue(id != "", "Missing OPAQUE user identifier")
}

func UnlockIdentifiers(vaultID []byte) (IdentityContext, error) {
	return encoding.Try(func() IdentityContext {
		id := encoding.Base32(encoding.B32.Write(vaultID))

		return IdentityContext{id, Identifiers{"envden/v1/unlock/" + id, "envden/v1/unlock-server"}}
	})
}

func PairingIdentifiers(pin []byte, mailbox int) (IdentityContext, error) {
	return encoding.Try(func() IdentityContext {
		encoding.RequireValue(mailbox >= 1 && mailbox <= 999)

		return IdentityContext{
			"envden/v1/pair",
			Identifiers{"envden/v1/pair/joiner", "envden/v1/pair/" + encoding.Base32(encoding.B32.Write(pin)) + "/" + strconv.Itoa(mailbox)},
		}
	})
}
