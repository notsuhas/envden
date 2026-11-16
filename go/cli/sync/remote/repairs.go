package remote

import (
	"encoding/json"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/records"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func PendingRepairs(home string) ([]string, error) {
	value, err := records.ReadSyncRecord(filepath.Join(home, "state", "pending-repairs.json"), func(saved string) ([]string, error) {
		var v []string
		err := json.Unmarshal([]byte(saved), &v)

		if v == nil && err == nil {
			err = envdenerrors.New(envdenerrors.InvalidData, "Invalid pending repairs")
		}

		return v, err
	})

	if value == nil {
		return []string{}, err
	}

	return *value, err
}

func SavePendingRepairs(home string, ids []string, now func() int64) error {
	if ids == nil {
		ids = []string{}
	}

	raw, err := jsonvalue.Marshal(ids)
	if err != nil {
		return err
	}

	return statefiles.AtomicWrite(filepath.Join(home, "state", "pending-repairs.json"), raw, now)
}

func ConsumeRepair(home, id string, now func() int64) error {
	pending, err := PendingRepairs(home)
	if err != nil {
		return err
	}

	kept := []string{}

	for _, v := range pending {
		if v != id {
			kept = append(kept, v)
		}
	}

	return SavePendingRepairs(home, kept, now)
}
