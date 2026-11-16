package state

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/cli/contracts"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/records"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Attempt struct {
	Header   string   `json:"header"`
	Sequence string   `json:"sequence"`
	Places   []string `json:"places"`
	Entries  []string `json:"entries"`
	Path     string   `json:"-"`
}

var receiptPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

var sequencePattern = regexp.MustCompile(`^\d{1,20}$`)

func Receipt(saved string) string {
	hash := sha256.Sum256([]byte(saved))

	return base64.RawURLEncoding.EncodeToString(hash[:])
}

func DecodeAttempt(saved, name string) (Attempt, error) {
	var value Attempt

	if Receipt(saved) != name {
		return value, envdenerrors.New(envdenerrors.InvalidData, "Attempt record checksum does not match")
	}
	if err := json.Unmarshal([]byte(saved), &value); err != nil {
		return value, err
	}

	if !receiptPattern.MatchString(value.Header) || !sequencePattern.MatchString(value.Sequence) || value.Places == nil || value.Entries == nil {
		return value, envdenerrors.New(envdenerrors.InvalidData, "Invalid attempt record")
	}

	var fields map[string]json.RawMessage
	_ = json.Unmarshal([]byte(saved), &fields)
	var places []json.RawMessage
	_ = json.Unmarshal(fields["places"], &places)

	for _, raw := range places {
		var text string

		if string(raw) == "null" || json.Unmarshal(raw, &text) != nil {
			return value, envdenerrors.New(envdenerrors.InvalidData, "Invalid attempt record")
		}
	}

	for _, entry := range value.Entries {
		raw, err := base64.RawURLEncoding.DecodeString(entry)
		if err != nil {
			return value, err
		}

		if _, err = encoding.Decode(manifests.FileEntryCodec, raw); err != nil {
			return value, err
		}
	}

	return value, nil
}

func holdCorrupt(home string, links []state.Link, path string, now func() int64) error {
	for _, link := range links {
		if err := statefiles.AtomicWrite(localfiles.BasePath(home, link.Store)+".corrupt", []byte(path), now); err != nil {
			return err
		}
	}

	return nil
}

func ReadAttempts(a contracts.Adapters, links []state.Link, now func() int64, report func(string)) ([]Attempt, error) {
	directory := filepath.Join(a.Home, "state", "attempts")
	entries, _ := os.ReadDir(directory)
	attempts := []Attempt{}

	for _, entry := range entries {
		name := entry.Name()
		receipt := strings.TrimSuffix(name, ".invalid")

		if !receiptPattern.MatchString(receipt) {
			continue
		}

		path := filepath.Join(directory, receipt)

		if strings.HasSuffix(name, ".invalid") {
			if err := holdCorrupt(a.Home, links, path, a.Now); err != nil {
				return nil, err
			}
			if err := remove(filepath.Join(directory, name)); err != nil {
				return nil, err
			}

			continue
		}

		value, err := records.RecoverSyncRecord(path, path+".invalid", func(saved string) (Attempt, error) { return DecodeAttempt(saved, name) }, now(), report)
		if err != nil {
			return nil, err
		}

		if value != nil {
			value.Path = path
			attempts = append(attempts, *value)
		} else {
			if err = holdCorrupt(a.Home, links, path, a.Now); err != nil {
				return nil, err
			}
			if err = remove(path + ".invalid"); err != nil {
				return nil, err
			}
		}
	}

	sort.SliceStable(attempts, func(i, j int) bool {
		a, _ := strconv.ParseUint(attempts[i].Sequence, 10, 64)
		b, _ := strconv.ParseUint(attempts[j].Sequence, 10, 64)

		return a < b
	})

	return attempts, nil
}

func remove(path string) error {
	err := os.Remove(path)

	if os.IsNotExist(err) {
		return nil
	}

	return err
}

func InvalidAttemptState(home string) (bool, error) {
	directory := filepath.Join(home, "state", "attempts")
	entries, _ := os.ReadDir(directory)

	for _, entry := range entries {
		name := entry.Name()

		if strings.HasSuffix(name, ".invalid") && receiptPattern.MatchString(strings.TrimSuffix(name, ".invalid")) {
			return true, nil
		}

		if !receiptPattern.MatchString(name) {
			continue
		}

		invalid, err := records.InvalidSyncRecord(filepath.Join(directory, name), func(saved string) (any, error) { return DecodeAttempt(saved, name) })
		if err != nil {
			return false, err
		}

		if invalid {
			return true, nil
		}
	}

	return false, nil
}
