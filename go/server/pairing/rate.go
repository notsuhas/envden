package pairing

import (
	"fmt"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	x "github.com/notsuhas/envden/go/server/shared"
)

func Charge(o x.Options, auth *x.Auth, n int, authorize func()) {
	if auth.Member {
		authorize()
		return
	}
	id := MailboxVault(o, auth.Request.VaultId, n)
	box := x.Must(o.Storage.Mailbox(id, n, o.Now()))
	if box == nil {
		x.Fail(e.NotFound, "Mailbox closed")
	}
	mailbox := c.SHA256(append([]byte(fmt.Sprintf("mailbox/%d/%d/", n, box.ExpiresAt)), id...))
	func() {
		defer func() {
			if err := recover(); err != nil {
				rejected := c.SHA256(append([]byte("rejected/"), mailbox...))
				charge(o, rejected)
				panic(err)
			}
		}()
		authorize()
	}()
	charge(o, mailbox)
}
func charge(o x.Options, id []byte) {
	result := x.Must(o.Storage.Charge(id, a.RateBucket{Kind: "mailbox"}, o.Now()))
	if result.Kind == "locked" {
		x.Fail(e.RateLimited, "Too many mailbox writes")
	}
}
