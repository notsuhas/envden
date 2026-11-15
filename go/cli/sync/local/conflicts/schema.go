package conflicts

import (
	"encoding/json"

	model "github.com/notsuhas/envden/go/cli/model/conflicts"
	e "github.com/notsuhas/envden/go/core/errors"
)

type Document struct {
	Model   string         `json:"model"`
	Records []model.Record `json:"records"`
}

func DecodeDocument(saved string) (Document, error) {
	var value Document
	err := json.Unmarshal([]byte(saved), &value)
	if err != nil {
		return value, err
	}
	if value.Model != "shared-store" || value.Records == nil {
		return value, e.New(e.InvalidData, "Invalid conflict document")
	}
	var doc struct{ Records []map[string]json.RawMessage }
	_ = json.Unmarshal([]byte(saved), &doc)
	for i, record := range value.Records {
		value.Records[i].JSONOrder = []string{"remote", "alternatives", "targets", "entry", "store", "root", "path", "mode", "base", "file", "server", "mine", "deleted", "mineDeleted"}
		for _, key := range []string{"remote", "store", "root", "path", "mode", "base", "file", "server", "mine"} {
			var text string
			if raw := doc.Records[i][key]; string(raw) == "null" || json.Unmarshal(raw, &text) != nil {
				return value, e.New(e.InvalidData, "Invalid conflict document")
			}
		}
		for _, key := range []string{"deleted", "mineDeleted"} {
			var flag bool
			if raw := doc.Records[i][key]; string(raw) == "null" || json.Unmarshal(raw, &flag) != nil {
				return value, e.New(e.InvalidData, "Invalid conflict document")
			}
		}

		for _, key := range []string{"remote", "alternatives", "targets", "entry", "store", "root", "path", "mode", "base", "file", "server", "mine", "deleted", "mineDeleted"} {
			if doc.Records[i][key] == nil {
				return value, e.New(e.InvalidData, "Invalid conflict document")
			}
		}
		if record.Alternatives == nil || record.Targets == nil || (record.Mode != "copy" && record.Mode != "link") {
			return value, e.New(e.InvalidData, "Invalid conflict document")
		}
		var rawRecord struct {
			Targets      []map[string]json.RawMessage
			Alternatives []json.RawMessage
		}
		_ = json.Unmarshal(doc.Records[i]["targets"], &rawRecord.Targets)
		_ = json.Unmarshal(doc.Records[i]["alternatives"], &rawRecord.Alternatives)
		for _, raw := range rawRecord.Alternatives {
			var text string
			if string(raw) == "null" || json.Unmarshal(raw, &text) != nil {
				return value, e.New(e.InvalidData, "Invalid conflict document")
			}
		}
		for targetIndex, target := range record.Targets {
			fields := rawRecord.Targets[targetIndex]
			for _, key := range []string{"root", "path", "store", "mode"} {
				var text string
				if raw := fields[key]; len(raw) == 0 || string(raw) == "null" || json.Unmarshal(raw, &text) != nil {
					return value, e.New(e.InvalidData, "Invalid conflict document")
				}
			}
			if raw, ok := fields["localOnly"]; ok && string(raw) != "true" {
				return value, e.New(e.InvalidData, "Invalid conflict document")
			}
			value.Records[i].Targets[targetIndex].OriginalLink = nil

			if target.Mode != "copy" && target.Mode != "link" {
				return value, e.New(e.InvalidData, "Invalid conflict document")
			}
		}
	}

	return value, nil
}
