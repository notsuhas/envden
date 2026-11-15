package updates

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/protocol/versions"
)

type Cache struct {
	CheckedAt *int64 `json:"checkedAt,omitempty"`
	Latest    string `json:"latest,omitempty"`
	Message   string `json:"message,omitempty"`
	order     []string
}

func ReadUpdateCache(home string) Cache {
	raw, e := os.ReadFile(filepath.Join(home, "state", "updates.json"))
	if e != nil {
		return Cache{}
	}

	var c Cache
	if json.Unmarshal(raw, &c) != nil {
		return Cache{}
	}

	value, e := jsonvalue.Parse(raw)
	if e != nil {
		return Cache{}
	}

	o, ok := value.(jsonvalue.Object)
	if !ok {
		return Cache{}
	}

	for _, field := range o {
		switch field.Key {
		case "latest":
			if _, ok := field.Value.(string); !ok {
				return Cache{}
			}
			if _, e = versions.ParseSemver(c.Latest); e != nil {
				return Cache{}
			}
		case "message":
			if _, ok := field.Value.(string); !ok {
				return Cache{}
			}
		case "checkedAt":
			if _, ok := field.Value.(json.Number); !ok {
				return Cache{}
			}
		default:
			continue
		}

		c.touch(field.Key)
	}

	return c
}

func (c *Cache) touch(key string) {
	for _, k := range c.order {
		if k == key {
			return
		}
	}

	c.order = append(c.order, key)
}

func (c Cache) MarshalJSON() ([]byte, error) {
	o := jsonvalue.Object{}
	keys := append(append([]string{}, c.order...), "checkedAt", "latest", "message")
	for _, key := range keys {
		switch key {
		case "checkedAt":
			if c.CheckedAt != nil {
				o.Set(key, *c.CheckedAt)
			}
		case "latest":
			if c.Latest != "" {
				o.Set(key, c.Latest)
			}
		case "message":
			if c.Message != "" {
				o.Set(key, c.Message)
			}
		}
	}

	return jsonvalue.Marshal(o)
}

func SaveUpdateCache(home string, c Cache, now func() int64) error {
	raw, e := jsonvalue.Marshal(c)
	if e != nil {
		return e
	}

	return files.AtomicWrite(filepath.Join(home, "state", "updates.json"), raw, now)
}
