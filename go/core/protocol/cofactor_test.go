package protocol_test

import (
	"encoding/base64"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/crypto"
)

// R is the order-two point, so only the cofactored equation (noble, even with zip215 off) accepts it.
func TestVerifyUsesTheCofactoredEquation(t *testing.T) {
	decode := func(text string) []byte {
		value, err := base64.StdEncoding.DecodeString(text)
		if err != nil {
			t.Fatal(err)
		}

		return value
	}

	pub := decode("6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=")
	sig := decode("7P///////////////////////////////////////38J/fdEhfNhHQRedbtXO1PPuNucqCol4DLctEXCBSlXAQ==")
	message := decode("cmV2aWV3IGZpeHR1cmU=")

	if !crypto.Verify(pub, "entry", message, sig).OK {
		t.Fatal("rejected a signature the TS verifier accepts")
	}

	if crypto.Verify(pub, "manifest", message, sig).OK {
		t.Fatal("accepted the signature under another label")
	}
}
