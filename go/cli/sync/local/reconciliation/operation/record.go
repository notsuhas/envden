package operation

import (
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"

	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/records"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Operation struct {
	Targets []state.Link `json:"targets"`
	Before  []*string    `json:"before"`
	Written []bool       `json:"written"`
	Entry   *string      `json:"entry"`
	Header  string       `json:"header"`
	Next    *string      `json:"next"`
	Server  *string      `json:"server"`
}

var headerPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func DecodeEntry(value string) (manifests.FileEntry, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return manifests.FileEntry{}, err
	}

	return encoding.Decode(manifests.FileEntryCodec, raw)
}

func DecodeOperation(saved string) (Operation, error) {
	var value Operation
	err := json.Unmarshal([]byte(saved), &value)
	if err != nil {
		return value, err
	}

	var fields map[string]json.RawMessage
	_ = json.Unmarshal([]byte(saved), &fields)
	valid := validList(fields["targets"], validTarget) && validList(fields["before"], func(v json.RawMessage) bool { return validString(v, true) }) && validList(fields["written"], func(v json.RawMessage) bool { return string(v) == "true" || string(v) == "false" })

	for _, key := range []string{"next", "server", "entry"} {
		valid = valid && validString(fields[key], true)
	}

	for _, key := range []string{"targets", "before", "written", "next", "server", "header", "entry"} {
		valid = valid && fields[key] != nil
	}

	for _, target := range value.Targets {
		valid = valid && (target.Mode == "link" || target.Mode == "copy")
	}

	if !valid || value.Targets == nil || value.Before == nil || value.Written == nil || !headerPattern.MatchString(value.Header) || len(value.Before) != len(value.Targets)+1 || len(value.Written) != len(value.Before) {
		return value, envdenerrors.New(envdenerrors.InvalidData, "Invalid placement record")
	}

	if value.Entry != nil && *value.Entry != "" {
		_, err = DecodeEntry(*value.Entry)
	}

	return value, err
}

func ReadOperation(path string, now func() int64, report func(string)) (*Operation, error) {
	return records.RecoverSyncRecord(path, strings.TrimSuffix(path, ".pending")+".corrupt", DecodeOperation, now(), report)
}
