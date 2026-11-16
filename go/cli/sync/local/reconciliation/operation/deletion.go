package operation

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/records"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

type Deletion struct {
	Entry   string   `json:"entry"`
	Targets []string `json:"targets"`
}

func DecodeDeletion(saved string) (Deletion, error) {
	var value Deletion
	if err := json.Unmarshal([]byte(saved), &value); err != nil {
		return value, err
	}

	var fields map[string]json.RawMessage
	_ = json.Unmarshal([]byte(saved), &fields)

	if !validString(fields["entry"], false) || !validList(fields["targets"], func(v json.RawMessage) bool { return validString(v, false) }) || value.Targets == nil {
		return value, envdenerrors.New(envdenerrors.InvalidData, "Invalid deletion record")
	}

	_, err := DecodeEntry(value.Entry)

	return value, err
}

func ReadDeletion(home, store string, now func() int64) (*Deletion, error) {
	base := localfiles.BasePath(home, store)

	return records.RecoverSyncRecord(base+".delete", base+".corrupt", DecodeDeletion, now(), nil)
}

func DeletionRequested(home, store string, now func() int64) (bool, error) {
	value, err := ReadDeletion(home, store, now)

	return value != nil, err
}

func RequestDeletion(home, store string, requested bool, entry *string, targets []string, now func() int64) error {
	base := localfiles.BasePath(home, store)
	path := base + ".delete"

	if !requested {
		return localfiles.WriteBytes(path, nil, now)
	}

	previous, err := ReadDeletion(home, store, now)
	if err != nil {
		return err
	}

	ancestor := entry

	if ancestor == nil {
		ancestor, err = statefiles.OptionalRead(base + ".entry")
		if err != nil {
			return err
		}
	}

	if ancestor == nil || *ancestor == "" {
		return nil
	}

	if targets == nil {
		targets = []string{}

		if previous != nil {
			targets = previous.Targets
		}
	}

	value, err := jsonvalue.Marshal(Deletion{*ancestor, targets})
	if err != nil {
		return err
	}

	return statefiles.AtomicWrite(path, value, now)
}
