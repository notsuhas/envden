package operation

import "encoding/json"

func validString(raw json.RawMessage, nullable bool) bool {
	if string(raw) == "null" {
		return nullable
	}
	var value string

	return len(raw) > 0 && json.Unmarshal(raw, &value) == nil
}

func validList(raw json.RawMessage, check func(json.RawMessage) bool) bool {
	if len(raw) == 0 || string(raw) == "null" {
		return false
	}
	var values []json.RawMessage
	if json.Unmarshal(raw, &values) != nil {
		return false
	}
	for _, value := range values {
		if !check(value) {
			return false
		}
	}

	return true
}

func validTarget(raw json.RawMessage) bool {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return false
	}
	for _, key := range []string{"root", "path", "store", "mode"} {
		if !validString(fields[key], false) {
			return false
		}
	}
	var mode string
	_ = json.Unmarshal(fields["mode"], &mode)

	return mode == "link" || mode == "copy"
}
