package pairing

import (
	"regexp"
	"strconv"
	"strings"

	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Code struct {
	Mailbox  int
	Password string
}

var codeChars = regexp.MustCompile(`^[0-9A-Za-z -]*$`)
var mailboxGroup = regexp.MustCompile(`^([0-9A-Za-z]+)[ -]+`)
var mailboxText = regexp.MustCompile(`^[1-9][0-9]{0,2}$`)

func NormalizePairingCode(input string) (Code, error) {
	bad := e.New(e.InvalidInput, "Codes look like 3-K7QF-2MXP")
	if !codeChars.MatchString(input) {
		return Code{}, bad
	}
	text := strings.NewReplacer("-", "", " ", "", "O", "0", "I", "1", "L", "1").Replace(strings.ToUpper(input))
	g := mailboxGroup.FindStringSubmatch(strings.TrimSpace(input))
	if len(g) > 0 && len(g[1]) != len(text)-8 {
		return Code{}, bad
	}
	if len(text) < 9 || !mailboxText.MatchString(text[:len(text)-8]) {
		return Code{}, bad
	}
	pw := text[len(text)-8:]
	if _, err := b.Unbase32(pw); err != nil {
		return Code{}, bad
	}
	n, _ := strconv.Atoi(text[:len(text)-8])

	return Code{n, pw}, nil
}

func GeneratePairingCode(mailbox int, rng ...c.Random) (string, error) {
	return b.Try(func() string {
		b.RequireValue(mailbox >= 1 && mailbox <= 999)
		v := c.RNG(rng)(5)
		b.RequireValue(len(v) == 5)
		s := b.Base32(v)

		return strconv.Itoa(mailbox) + "-" + s[:4] + "-" + s[4:]
	})
}

type ChannelKeys struct{ JoinerToApprover, ApproverToJoiner []byte }

func PairingChannelKeys(sessionKey []byte) (ChannelKeys, error) {
	return b.Try(func() ChannelKeys {
		b.RequireValue(len(sessionKey) == 64, "Invalid OPAQUE session key")

		return ChannelKeys{c.KDF(sessionKey, nil, "pair/joiner-to-approver"), c.KDF(sessionKey, nil, "pair/approver-to-joiner")}
	})
}
