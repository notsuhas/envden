package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/repair"
	"github.com/notsuhas/envden/go/server/shared"
)

func (app *App) importRoute(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	path := r.URL.EscapedPath()
	var result any
	parts := strings.Split(path, "/")
	for i, part := range parts {
		if decoded, err := url.PathUnescape(part); err == nil {
			parts[i] = decoded
		}
	}
	if len(parts) > 3 {
		if parts[2] == "move" {
			if err := authn.RequireMove(o, auth); err != nil {
				return false, err
			}
		} else {
			if err := authn.RequireRepair(o, auth); err != nil {
				return false, err
			}
		}
		if r.Method == "POST" && (parts[3] == "history" || parts[3] == "chain") {
			var committed adapters.CommitResult
			if parts[3] == "chain" {
				protocolInputResult2, err := protocolInput(encoding.List(manifests.SwapCodec), body)
				if err != nil {
					return false, err
				}
				uploadChain, err := repair.UploadChain(o, auth, protocolInputResult2)
				if err != nil {
					return false, err
				}

				committed = uploadChain
			} else {
				protocolInputResult3, err := protocolInput(manifests.SwapCodec, body)
				if err != nil {
					return false, err
				}
				uploadHistory, err := repair.UploadHistory(o, auth, protocolInputResult3, crypto.H("swap", body), true)
				if err != nil {
					return false, err
				}

				committed = uploadHistory
			}
			if err := app.commitResponse(w, r, committed, false); err != nil {
				return false, err
			}

			return true, nil
		}
		if r.Method == "PUT" && len(parts) == 6 && parts[3] == "material" {
			binaryResult, err := shared.Binary(parts[5], 32)
			if err != nil {
				return false, err
			}
			storeMaterial, err := repair.StoreMaterial(o, auth, parts[4], binaryResult, body)
			if err != nil {
				return false, err
			}

			result = storeMaterial
		}
	}
	if result != nil {
		if err := app.json(w, r, result, 200); err != nil {
			return false, err
		}

		return true, nil
	}

	return false, nil
}
