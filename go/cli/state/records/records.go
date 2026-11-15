package records

import (
	"fmt"
	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
)

func ReadSyncRecord[T any](path string, decode func(string) (T, error)) (*T, error) {
	raw, err := files.OptionalRead(path)
	if err != nil || raw == nil {
		return nil, err
	}
	value, err := decode(*raw)
	if err != nil {
		return nil, errors.New(errors.InvalidData, "Invalid sync state: "+path+"; move this file aside and run envden pull")
	}
	return &value, nil
}
func RecoverSyncRecord[T any](path, marker string, decode func(string) (T, error), now int64, report func(string)) (*T, error) {
	value, err := ReadSyncRecord(path, decode)
	if !errors.Is(err, errors.InvalidData) {
		return value, err
	}
	backup := fmt.Sprintf("%s.corrupt-%013d_%s", path, now, uuid.NewString())
	if err = files.AtomicWrite(marker, []byte(backup), func() int64 { return now }); err != nil {
		return nil, err
	}
	if err = os.Rename(path, backup); err != nil {
		return nil, err
	}
	if report != nil {
		report("Invalid sync state: " + path + "; saved " + backup + "; run envden pull, then envden resolve --list")
	}
	return nil, nil
}
func InvalidSyncRecord(path string, decode func(string) (any, error)) (bool, error) {
	_, err := ReadSyncRecord(path, decode)
	if errors.Is(err, errors.InvalidData) {
		return true, nil
	}
	return false, err
}
