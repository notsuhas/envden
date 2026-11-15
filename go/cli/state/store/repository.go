package store

import (
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/journal"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	"path/filepath"
)

func SaveState(ctx context.Context, home string, state *model.State, timing lock.Timing) error {
	return lock.WithStateLock(ctx, home, timing, func(context.Context) error {
		if err := files.PrivateDirectory(home); err != nil {
			return err
		}
		refs, err := StoreHeaders(home, state.Headers, timing.Now)
		if err != nil {
			return err
		}
		record := state.Record()
		record.Set("headerRefs", refs)
		data, err := jsonvalue.Marshal(record)
		if err != nil {
			return err
		}
		if err = files.AtomicWrite(filepath.Join(home, "state", "device.json"), data, timing.Now); err != nil {
			return err
		}
		return journal.ClearPlacement(home)
	})
}

func LoadState(home string) (*model.State, error) {
	raw, err := files.OptionalRead(filepath.Join(home, "state", "device.json"))
	if err != nil || raw == nil {
		return nil, err
	}
	state, err := decodeState(home, []byte(*raw))
	if err != nil {
		return nil, errors.Wrap(errors.InvalidData, "Unreadable local state", err)
	}
	return state, nil
}

func decodeState(home string, data []byte) (*model.State, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	allowed := map[string]bool{}
	for _, k := range []string{"format", "verifiedState", "aliasAsked", "deviceName", "vaultId", "creationPending", "server", "checkpoint", "headerRefs", "entries", "keyring", "files", "session", "approved", "links", "aliases", "telemetry", "updateCheck"} {
		allowed[k] = true
	}
	for k := range fields {
		if !allowed[k] {
			return nil, errors.New(errors.InvalidData, "Invalid state")
		}
	}
	for _, k := range []string{"format", "deviceName", "headerRefs", "entries", "approved", "links", "aliases", "telemetry", "updateCheck"} {
		if fields[k] == nil || string(fields[k]) == "null" {
			return nil, errors.New(errors.InvalidData, "Invalid state")
		}
	}
	var state model.State
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	if state.Format != 1 {
		return nil, errors.New(errors.InvalidData, "Invalid state")
	}
	var refs []string
	if err := json.Unmarshal(fields["headerRefs"], &refs); err != nil {
		return nil, err
	}
	headers, err := RestoreHeaders(home, refs)
	if err != nil {
		return nil, err
	}
	state.Headers = headers
	cache, err := files.OptionalRead(filepath.Join(home, "state", "updates.json"))
	if err != nil {
		return nil, err
	}
	if cache != nil {
		var v struct{ Latest string }
		if json.Unmarshal([]byte(*cache), &v) == nil {
			state.Latest = v.Latest
		}
	}
	if err = journal.RestorePlacement(home, &state); err != nil {
		return nil, err
	}
	return &state, nil
}
