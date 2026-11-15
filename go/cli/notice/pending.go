package notice

import (
	"encoding/json"
	"io"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
)

func pendingJoins(home string) jsonvalue.Object {
	raw, e := files.OptionalRead(filepath.Join(home, "state", "pending-recovery.json"))
	if e != nil || raw == nil {
		return jsonvalue.Object{}
	}

	value, e := jsonvalue.Parse([]byte(*raw))
	if e != nil {
		return jsonvalue.Object{}
	}

	o, ok := value.(jsonvalue.Object)
	if !ok {
		return jsonvalue.Object{}
	}

	for _, f := range o {
		if _, ok := f.Value.(string); !ok {
			return jsonvalue.Object{}
		}
	}

	return o
}

func AddPendingJoins(home string, entries []string, ownID []byte, now func() int64) error {
	pending := pendingJoins(home)
	raw, e := files.OptionalRead(filepath.Join(home, "state", "recovery-notice"))
	if e != nil {
		return e
	}

	seen := []string{}
	if raw != nil {
		if e = json.Unmarshal([]byte(*raw), &seen); e != nil {
			return e
		}
	}

	notices, e := RecoveryJoins(entries, ownID)
	if e != nil {
		return e
	}

	for _, f := range notices {
		already := false
		for _, id := range seen {
			if id == f.Key {
				already = true
			}
		}

		if !already {
			pending.Set(f.Key, f.Value)
		}
	}

	data, e := jsonvalue.Marshal(pending)
	if e != nil {
		return e
	}

	return files.AtomicWrite(filepath.Join(home, "state", "pending-recovery.json"), data, now)
}

func ReportPendingJoins(home string, now func() int64, w io.Writer) error {
	if e := PrintRecoveryJoins(home, pendingJoins(home), now, w); e != nil {
		return e
	}

	return files.AtomicWrite(filepath.Join(home, "state", "pending-recovery.json"), []byte("{}"), now)
}
