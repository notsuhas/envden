package settings

import (
	"bytes"
	"context"
	"encoding/json"
	"os"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

type Config struct {
	Placement            *jsonvalue.Object `json:"placement,omitempty"`
	EnvFiles             *jsonvalue.Object `json:"env-files,omitempty"`
	Telemetry            bool              `json:"telemetry"`
	UpdateCheck          bool              `json:"update-check"`
	AgentMerge           bool              `json:"agent-merge"`
	AutoApproveWorktrees bool              `json:"auto-approve-worktrees"`
}

func ParseConfig(data []byte) (Config, error) {
	c, err := parseSharedConfig(data)
	if err != nil {
		return Config{}, err
	}

	if err = refusePatterns(c); err != nil {
		return Config{}, err
	}

	return c, nil
}

// The schema the reference shares; pattern refusal applies only to configs that pass it.
func parseSharedConfig(data []byte) (Config, error) {
	c := Config{UpdateCheck: true, AutoApproveWorktrees: true}
	var m map[string]json.RawMessage
	invalid := func() (Config, error) { return Config{}, errors.New(errors.InvalidInput, "Invalid config") }
	if json.Unmarshal(data, &m) != nil || m == nil {
		return invalid()
	}

	for k, v := range m {
		switch k {
		case "placement":
			parsed, e := jsonvalue.Parse(v)
			if e != nil {
				return invalid()
			}
			object, ok := parsed.(jsonvalue.Object)
			if !ok {
				return invalid()
			}
			for _, f := range object {
				if f.Value != "link" && f.Value != "copy" {
					return invalid()
				}
			}
			c.Placement = &object
		case "env-files":
			parsed, e := jsonvalue.Parse(v)
			if e != nil {
				return invalid()
			}
			object, ok := parsed.(jsonvalue.Object)
			if !ok {
				return invalid()
			}
			ordered := jsonvalue.Object{}
			for _, key := range []string{"include", "exclude", "extraSkipped"} {
				for _, f := range object {
					if f.Key == key {
						ordered.Set(key, f.Value)
					}
				}
			}
			for _, f := range object {
				if f.Key != "include" && f.Key != "exclude" && f.Key != "extraSkipped" {
					return invalid()
				}

				a, ok := f.Value.([]any)
				if !ok {
					return invalid()
				}

				for _, x := range a {
					s, ok := x.(string)
					if !ok || s == "" {
						return invalid()
					}
				}
			}
			c.EnvFiles = &ordered
		case "telemetry", "update-check", "agent-merge", "auto-approve-worktrees":
			if string(v) != "true" && string(v) != "false" {
				return invalid()
			}
			value := string(v) == "true"
			switch k {
			case "telemetry":
				c.Telemetry = value
			case "update-check":
				c.UpdateCheck = value
			case "agent-merge":
				c.AgentMerge = value
			case "auto-approve-worktrees":
				c.AutoApproveWorktrees = value
			}
		default:
			return invalid()
		}
	}

	return c, nil
}

func refusePatterns(c Config) error {
	if c.EnvFiles == nil {
		return nil
	}

	for _, key := range []string{"include", "exclude"} {
		patterns, _ := c.EnvFiles.Get(key).([]any)
		for _, pattern := range patterns {
			if text, _ := pattern.(string); adapters.UnsupportedEnvPattern(text) {
				return errors.New(errors.InvalidInput, "Unsupported env file pattern")
			}
		}
	}

	return nil
}

// RefuseConfiguredPatterns runs before a sync writes; a config the shared schema rejects fails where it always has.
func RefuseConfiguredPatterns(home string) error {
	if c, ok := sharedConfigAt(home); ok {
		return refusePatterns(c)
	}

	return nil
}

func sharedConfigAt(home string) (Config, bool) {
	raw, err := os.ReadFile(Paths(home).Config)
	if err != nil || !json.Valid(raw) {
		return Config{}, false
	}

	c, err := parseSharedConfig(raw)

	return c, err == nil
}

func ReadConfig(home string) (Config, error) {
	raw, err := os.ReadFile(Paths(home).Config)
	if os.IsNotExist(err) {
		return ParseConfig([]byte("{}"))
	}

	if err != nil {
		return Config{}, errors.Wrap(errors.InvalidData, "Unreadable config", err)
	}

	if !json.Valid(raw) {
		return Config{}, errors.New(errors.InvalidData, "Unreadable config")
	}

	return ParseConfig(raw)
}

func SetConfig(ctx context.Context, key, value, home string, timing lock.Timing, interactive bool) (Config, error) {
	if (key == "agent-merge" || key == "auto-approve-worktrees") && value == "on" && !interactive {
		return Config{}, errors.New(errors.InvalidInput, "Turning on "+key+" requires a terminal")
	}

	var result Config
	err := lock.WithStateLock(ctx, Paths(home).Home, timing, func(context.Context) error {
		current, e := ReadConfig(home)
		if e != nil {
			return e
		}

		b, e := jsonvalue.Marshal(current)
		if e != nil {
			return e
		}

		parsed, e := jsonvalue.Parse(b)
		if e != nil {
			return e
		}

		object := parsed.(jsonvalue.Object)
		var next any
		if key == "placement" || key == "env-files" {
			next, e = jsonvalue.Parse([]byte(value))
			if e != nil {
				return errors.Wrap(errors.InvalidInput, "Expected a JSON settings object", e)
			}
		} else {
			if value != "on" && value != "off" {
				return errors.New(errors.InvalidInput, "Expected on or off")
			}

			next = value == "on"
		}

		object.Set(key, next)
		b, e = jsonvalue.Marshal(object)
		if e != nil {
			return e
		}

		result, e = ParseConfig(b)
		if e != nil {
			return e
		}

		p, e := EnsurePaths(home)
		if e != nil {
			return e
		}

		b, e = jsonvalue.Marshal(result)
		if e != nil {
			return e
		}

		var pretty bytes.Buffer
		if e = json.Indent(&pretty, b, "", "  "); e != nil {
			return e
		}

		return files.AtomicWrite(p.Config, append(pretty.Bytes(), '\n'), timing.Now)
	})

	return result, err
}
