package inputs

import (
	"encoding/json"
	"path/filepath"
	"unicode/utf16"

	"github.com/notsuhas/envden/go/core/errors"
)

type Input struct {
	Root    string `json:"root,omitempty"`
	Path    string `json:"path,omitempty"`
	Name    string `json:"name,omitempty"`
	ID      string `json:"id,omitempty"`
	Choice  string `json:"choice,omitempty"`
	Version int64  `json:"version,omitempty"`
}

func text(value any, max int) bool {
	s, ok := value.(string)

	return ok && len(utf16.Encode([]rune(s))) > 0 && len(utf16.Encode([]rune(s))) <= max
}

func ParseInput(kind string, raw []byte) (Input, error) {
	var values map[string]any
	message := "Choose an env file"
	fields := []string{"root", "path"}
	switch kind {
	case "rename":
		message = "Enter a device name"
		fields = []string{"name"}
	case "resolve":
		message = "Choose a conflict and a side"
		fields = []string{"id", "choice"}
	case "restore":
		message = "Choose a version"
		fields = []string{"root", "path", "version"}
	}

	invalid := func() (Input, error) { return Input{}, errors.New(errors.InvalidInput, message) }
	if json.Unmarshal(raw, &values) != nil || len(values) != len(fields) {
		return invalid()
	}

	for _, f := range fields {
		if _, ok := values[f]; !ok {
			return invalid()
		}
	}

	var result Input
	switch kind {
	case "rename":
		if !text(values["name"], 256) {
			return invalid()
		}
		result.Name = values["name"].(string)
	case "resolve":
		if !text(values["id"], 4096) || values["choice"] != "keep-mine" && values["choice"] != "take-server" {
			return invalid()
		}
		result.ID = values["id"].(string)
		result.Choice = values["choice"].(string)
	default:
		if !text(values["root"], 4096) || !text(values["path"], 4096) {
			return invalid()
		}
		result.Root = values["root"].(string)
		result.Path = values["path"].(string)
		if !filepath.IsAbs(result.Root) {
			return invalid()
		}
		if kind == "restore" {
			n, ok := values["version"].(float64)
			if !ok || n <= 0 || n > 9007199254740991 || n != float64(int64(n)) {
				return invalid()
			}

			result.Version = int64(n)
		}
	}

	return result, nil
}
