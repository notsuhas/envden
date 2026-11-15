package pairing

import (
	"bytes"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	"github.com/notsuhas/envden/go/core/protocol/pairing"
)

func TestLocalPairing(t *testing.T) {
	pin := bytes.Repeat([]byte{7}, 32)
	attempt, err := PreparePairing(pin, 3)
	if err != nil {
		t.Fatal(err)
	}

	code, err := pairing.NormalizePairingCode(attempt.Code)
	if err != nil {
		t.Fatal(err)
	}

	start, err := opaque.OpaqueStartLogin(code.Password)
	if err != nil {
		t.Fatal(err)
	}

	response, err := attempt.Answer(start.StartLoginRequest)
	if err != nil {
		t.Fatal(err)
	}

	if _, err = attempt.Answer(start.StartLoginRequest); !errors.Is(err, errors.Unauthorized) {
		t.Fatal(err)
	}

	ids, err := opaque.PairingIdentifiers(pin, 3)
	if err != nil {
		t.Fatal(err)
	}

	finish, err := opaque.OpaqueFinishLogin(opaque.FinishLoginParams{Password: code.Password, ClientLoginState: start.ClientLoginState, LoginResponse: response.LoginResponse, Identifiers: ids.Identifiers})
	if err != nil || !finish.OK {
		t.Fatal(err)
	}

	keys, err := FinishApprover(pin, 3, response.ServerLoginState, finish.FinishLoginRequest)
	if err != nil {
		t.Fatal(err)
	}

	raw, err := client.Binary(finish.SessionKey)
	if err != nil {
		t.Fatal(err)
	}

	expected, err := pairing.PairingChannelKeys(raw)
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(keys.ApproverToJoiner, expected.ApproverToJoiner) || !bytes.Equal(keys.JoinerToApprover, expected.JoinerToApprover) {
		t.Fatal("pairing channel mismatch")
	}
}

func TestPairingResponse(t *testing.T) {
	for _, row := range []struct {
		raw     string
		expiry  int64
		message string
	}{{`{"kind":"pending"}`, 200, ""}, {`{"kind":"pending","expiresAt":100}`, 100, ""}, {`{"message":"abc","expiresAt":150}`, 150, "abc"}, {`{"message":"abc"}`, 200, "abc"}} {
		got, err := PairingResponse([]byte(row.raw), 200)
		if err != nil || got.ExpiresAt != row.expiry {
			t.Fatal(row, got, err)
		}

		if row.message != "" && (got.Message == nil || *got.Message != row.message) {
			t.Fatal(row, got)
		}
	}

	if _, err := PairingResponse([]byte(`{"other":1}`), 200); !errors.Is(err, errors.InvalidData) {
		t.Fatal(err)
	}

	if err := RequireWindow(600001, 0); !errors.Is(err, errors.InvalidData) {
		t.Fatal(err)
	}

	if err := RequireWindow(100, 100); !errors.Is(err, errors.Unauthorized) {
		t.Fatal(err)
	}
}
