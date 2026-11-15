package routes

import (
	"context"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
	"github.com/notsuhas/envden/go/core/errors"
	"io"
	"net/http"
)

type Action func(context.Context, inputs.Input) (any, error)
type Actions struct{ Status, Devices, Pull, Push, Resolve, Rename, History, Restore Action }

func API(r *http.Request, actions Actions) (any, bool, error) {
	var action Action
	kind := ""
	switch r.Method + " " + r.URL.Path {
	case "GET /api/status":
		action = actions.Status
	case "GET /api/devices":
		action = actions.Devices
	case "POST /api/pull":
		action = actions.Pull
	case "POST /api/push":
		action = actions.Push
	case "POST /api/resolve":
		action = actions.Resolve
		kind = "resolve"
	case "POST /api/devices/rename":
		action = actions.Rename
		kind = "rename"
	case "GET /api/history":
		action = actions.History
		kind = "file"
	case "POST /api/history/restore":
		action = actions.Restore
		kind = "restore"
	default:
		return nil, false, nil
	}
	var input inputs.Input
	if kind != "" {
		var raw []byte
		if kind == "file" {
			object := jsonvalue.Object{}
			for k, v := range r.URL.Query() {
				if len(v) > 0 {
					object.Set(k, v[0])
				}
			}
			raw, _ = jsonvalue.Marshal(object)
		} else {
			raw, _ = io.ReadAll(r.Body)
		}
		var err error
		input, err = inputs.ParseInput(kind, raw)
		if err != nil {
			return nil, true, err
		}
	}
	if action == nil {
		return nil, true, errors.New(errors.NotImplemented, "not implemented")
	}
	result, err := action(r.Context(), input)
	return result, true, err
}
