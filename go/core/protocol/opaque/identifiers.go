package opaque

import (
	"strconv"

	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Identifiers struct{ Client, Server string }
type IdentityContext struct {
	UserIdentifier string
	Identifiers    Identifiers
}

func checkIdentifiers(ids Identifiers) {
	b.RequireValue(ids.Client != "" && ids.Server != "", "Missing OPAQUE identifiers")
}

func checkUserIdentifier(id string) { b.RequireValue(id != "", "Missing OPAQUE user identifier") }

func UnlockIdentifiers(vaultID []byte) (IdentityContext, error) {
	return b.Try(func() IdentityContext {
		id := b.Base32(b.B32.Write(vaultID))

		return IdentityContext{id, Identifiers{"envden/v1/unlock/" + id, "envden/v1/unlock-server"}}
	})
}

func PairingIdentifiers(pin []byte, mailbox int) (IdentityContext, error) {
	return b.Try(func() IdentityContext {
		b.RequireValue(mailbox >= 1 && mailbox <= 999)

		return IdentityContext{
			"envden/v1/pair",
			Identifiers{"envden/v1/pair/joiner", "envden/v1/pair/" + b.Base32(b.B32.Write(pin)) + "/" + strconv.Itoa(mailbox)},
		}
	})
}
