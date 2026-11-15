package pairing

import (
	"regexp"
	"strconv"
	"strings"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Code struct {
	Mailbox  int
	Password string
}

var codeChars = regexp.MustCompile(`^[0-9A-Za-z -]*$`)

var mailboxGroup = regexp.MustCompile(`^([0-9A-Za-z]+)[ -]+`)

var mailboxText = regexp.MustCompile(`^[1-9][0-9]{0,2}$`)

func NormalizePairingCode(input string) (Code, error) {
	bad := enverrors.New(enverrors.InvalidInput, "Codes look like 3-K7QF-2MXP")
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
	if _, err := encoding.Unbase32(pw); err != nil {
		return Code{}, bad
	}
	n, _ := strconv.Atoi(text[:len(text)-8])

	return Code{n, pw}, nil
}

func GeneratePairingCode(mailbox int, rng ...crypto.Random) (string, error) {
	return encoding.Try(func() string {
		encoding.RequireValue(mailbox >= 1 && mailbox <= 999)
		v := crypto.RNG(rng)(5)
		encoding.RequireValue(len(v) == 5)
		s := encoding.Base32(v)

		return strconv.Itoa(mailbox) + "-" + s[:4] + "-" + s[4:]
	})
}

type ChannelKeys struct{ JoinerToApprover, ApproverToJoiner []byte }

func PairingChannelKeys(sessionKey []byte) (ChannelKeys, error) {
	return encoding.Try(func() ChannelKeys {
		encoding.RequireValue(len(sessionKey) == 64, "Invalid OPAQUE session key")

		return ChannelKeys{crypto.KDF(sessionKey, nil, "pair/joiner-to-approver"), crypto.KDF(sessionKey, nil, "pair/approver-to-joiner")}
	})
}
