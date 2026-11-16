package lock

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
)

type Owner struct {
	PID       int     `json:"pid"`
	StartedAt string  `json:"startedAt"`
	Token     string  `json:"token"`
	Identity  string  `json:"identity,omitempty"`
	CreatedAt float64 `json:"createdAt"`
}

func ReadOwner(path string) *Owner {
	d, err := os.Lstat(path)
	if err != nil || !d.IsDir() {
		return nil
	}

	p := filepath.Join(path, "owner.json")
	s, err := os.Lstat(p)
	if err != nil || !s.Mode().IsRegular() {
		return nil
	}

	f, err := os.Open(p)
	if err != nil {
		return nil
	}

	defer func() { _ = f.Close() }() // Best-effort cleanup must not replace the operation result.
	info, err := f.Stat()
	if err != nil || !os.SameFile(s, info) {
		return nil
	}

	var v map[string]json.RawMessage
	if json.NewDecoder(f).Decode(&v) != nil {
		return nil
	}

	for _, key := range []string{"pid", "token", "startedAt", "createdAt"} {
		if v[key] == nil {
			return nil
		}
	}

	for _, key := range []string{"token", "startedAt", "identity"} {
		if raw, ok := v[key]; ok {
			var value any
			if json.Unmarshal(raw, &value) != nil {
				return nil
			}
			if _, ok := value.(string); !ok {
				return nil
			}
		}
	}
	if string(v["createdAt"]) == "null" {
		return nil
	}
	var pid float64
	if json.Unmarshal(v["pid"], &pid) != nil || pid <= 0 || math.Trunc(pid) != pid || pid > 9007199254740991 || pid >= float64(math.MaxInt) {
		return nil
	}
	v["pid"], _ = json.Marshal(int(pid))
	b, _ := json.Marshal(v)
	var value Owner
	if json.Unmarshal(b, &value) != nil || value.PID <= 0 {
		return nil
	}

	return &value
}

func Reclaimable(previous Owner, observed Process, identity string, now int64) bool {
	if identity == "" || previous.Identity != identity {
		if identity != "" && previous.Identity != "" {
			var a, b struct{ Host, Boot string }
			if json.Unmarshal([]byte(previous.Identity), &a) == nil && json.Unmarshal([]byte(identity), &b) == nil && a.Host == b.Host && a.Boot != b.Boot {
				return true
			}
		}

		return float64(now)-previous.CreatedAt >= 86400000
	}

	return observed.Kind == "dead" || observed.Kind == "live" && observed.StartedAt != previous.StartedAt
}

func PublishOwner(path string, value Owner) error {
	temporary := filepath.Join(path, "."+value.Token+".tmp")
	f, err := os.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}

	defer func() { _ = os.Remove(temporary) }() // Best-effort cleanup must not replace the operation result.
	b, err := jsonvalue.Marshal(value)
	if err == nil {
		_, err = f.Write(b)
	}

	if err == nil {
		err = f.Sync()
	}

	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}

	if err != nil {
		return err
	}

	return os.Link(temporary, filepath.Join(path, "owner.json"))
}
