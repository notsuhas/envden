package operation

import (
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/sync/local"
)

func BlocksFile(home, store string, writable bool, now func() int64) (bool, error) {
	records, err := local.ConflictRecords(home)
	if err != nil {
		return false, err
	}

	found := false
	kept := []conflictmodel.Record{}

	for _, record := range records {
		if record.Store == store {
			found = true
		} else {
			kept = append(kept, record)
		}
	}

	if !found {
		return false, nil
	}

	if !writable {
		return true, nil
	}

	return false, local.SaveConflicts(home, kept, now)
}
