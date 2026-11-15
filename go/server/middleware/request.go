package middleware

import (
	"bytes"
	"net/http"
	"strconv"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func verifyRequest(o shared.Options, r *http.Request) (wire.Request, *members.DeviceRecord, error) {
	request, err := shared.Input(func() (wire.Request, error) {
		binary, err := shared.Binary(r.Header.Get("Envden-Request"))
		if err != nil {
			return wire.Request{}, err
		}

		return encoding.Decode(wire.RequestCodec, binary)
	})
	if err != nil {
		return wire.Request{}, nil, err
	}

	signature, err := shared.Binary(r.Header.Get("Envden-Signature"), 64)
	if err != nil {
		return wire.Request{}, nil, err
	}

	binaryResult, err := shared.Binary(r.Header.Get("Envden-Device"), 16)
	if err != nil {
		return wire.Request{}, nil, err
	}
	identityMismatch := !bytes.Equal(request.Device, binaryResult) || strconv.FormatUint(request.Time, 10) != r.Header.Get("Envden-Time")
	if !identityMismatch {
		binaryResult2, err := shared.Binary(r.Header.Get("Envden-Nonce"), 16)
		if err != nil {
			return wire.Request{}, nil, err
		}
		identityMismatch = !bytes.Equal(request.Nonce, binaryResult2)
	}
	bindingMismatch := identityMismatch ||
		request.Method != r.Method || request.PathAndQuery != r.URL.RequestURI()
	if !bindingMismatch {
		binaryResult3, err := shared.Binary(r.Header.Get("Envden-Body-Hash"), 32)
		if err != nil {
			return wire.Request{}, nil, err
		}
		bindingMismatch = !bytes.Equal(request.BodyHash, binaryResult3)
	}
	if bindingMismatch {
		return wire.Request{}, nil, enverrors.New(enverrors.Unauthorized, "Request binding mismatch")
	}
	member, err := vaultchain.Membership(o, request.VaultId, request.Device)
	if err != nil {
		return wire.Request{}, nil, err
	}

	supplied := member
	if supplied == nil {
		record, err := shared.Input(func() (members.DeviceRecord, error) {
			binaryResult4, err := shared.Binary(r.Header.Get("Envden-Device-Record"))
			if err != nil {
				return members.DeviceRecord{}, err
			}

			return encoding.Decode(members.DeviceRecordCodec, binaryResult4)
		})
		if err != nil {
			return wire.Request{}, nil, err
		}

		supplied = &record
	}
	invalidSignature := !bytes.Equal(supplied.Id, request.Device)
	if !invalidSignature {
		serverPin, err := keys.ServerPin(o.ServerKeys.PublicKey)
		if err != nil {
			return wire.Request{}, nil, err
		}
		verifyRequestHash, err := requests.VerifyRequestHash(encoding.Signed[wire.Request]{Body: request, Signature: signature}, supplied.ReqPub, serverPin, request.BodyHash, uint64(o.Now()), false) //nolint:gosec // G115: the injected clock supplies Unix milliseconds, matching the protocol timestamp.
		if err != nil {
			return wire.Request{}, nil, err
		}
		invalidSignature = !verifyRequestHash.OK
	}
	if invalidSignature {
		return wire.Request{}, nil, enverrors.New(enverrors.Unauthorized, "Invalid request")
	}

	return request, member, nil
}
