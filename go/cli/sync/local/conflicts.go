package local

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/output"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/records"
	conflicts "github.com/notsuhas/envden/go/cli/sync/local/conflicts"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/placement"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/presentation"
	"github.com/notsuhas/envden/go/core/merge"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func ConflictRecords(home string) ([]conflictmodel.Record, error) {
	doc, err := records.ReadSyncRecord(filepath.Join(home, "state", "conflicts.json"), conflicts.DecodeDocument)

	if doc == nil {
		return []conflictmodel.Record{}, err
	}

	return doc.Records, err
}

func SaveConflicts(home string, records []conflictmodel.Record, now func() int64) error {
	if records == nil {
		records = []conflictmodel.Record{}
	}

	raw, err := jsonvalue.Marshal(conflicts.Document{Model: "shared-store", Records: records})
	if err != nil {
		return err
	}

	return statefiles.AtomicWrite(filepath.Join(home, "state", "conflicts.json"), raw, now)
}

func Backup(home, path string, now int64) (string, error) {
	value, err := localfiles.ReadBytes(path)
	if err != nil || value == nil {
		return "", err
	}

	saved := filepath.Join(home, "conflicts", "backups", fmt.Sprintf("%013d_%s", now, uuid.NewString()))
	if err = statefiles.AtomicWrite(saved, value, func() int64 { return now }); err != nil {
		return "", err
	}

	return saved, nil
}

func RecordConflict(context *syncmodel.Context, target conflictmodel.Record, mine []byte, theirs content.Server, previous []byte, variants [][]byte) error {
	records, err := ConflictRecords(context.Adapters.Home)
	if err != nil {
		return err
	}

	for _, item := range records {
		if item.Base == target.Base {
			return nil
		}
	}

	hash := sha256.Sum256([]byte(target.Base))
	file := filepath.Join(context.Adapters.Home, "conflicts", encoding.Base32(hash[:]))
	device := ""

	if target.Entry != nil {
		raw, err := client.Binary(*target.Entry)
		if err != nil {
			return err
		}

		entry, err := encoding.Decode(manifests.FileEntryCodec, raw)
		if err != nil {
			return err
		}

		device, err = conflicts.EntryAuthor(context, entry)
		if err != nil {
			return err
		}
	}

	var server []byte

	if theirs.Kind == "live" {
		server = theirs.Bytes
	}

	marked := merge.Result{}
	value := mine

	if mine != nil && server != nil {
		label := "server"

		if device != "" {
			label = "server (from " + device + ")"
		}

		marked = merge.MarkConflicts(previous, mine, server, merge.Labels{Mine: "this device", Theirs: label})
		value = marked.Bytes
	}

	remote := []byte(nil)

	if len(variants) > 1 {
		remote = variants[1]
	}

	for _, item := range []struct {
		path  string
		value []byte
	}{{file, value}, {file + ".server", server}, {file + ".mine", mine}, {file + ".remote", remote}} {
		if err := localfiles.WriteBytes(item.path, item.value, context.Options.Now); err != nil {
			return err
		}
	}

	alternatives := []string{}

	for index, value := range variants {
		if value == nil {
			continue
		}

		seen := false

		for _, old := range variants[:index] {
			if localfiles.Same(old, value) {
				seen = true
				break
			}
		}

		if seen {
			continue
		}

		path := fmt.Sprintf("%s.variant-%d", file, index)
		if err := localfiles.WriteBytes(path, value, context.Options.Now); err != nil {
			return err
		}

		alternatives = append(alternatives, path)
	}

	target.Alternatives = alternatives
	target.Remote = file + ".remote"
	target.File = file
	target.Server = file + ".server"
	target.Mine = file + ".mine"
	target.MineDeleted = mine == nil
	target.Deleted = theirs.Kind == "tombstone"
	records = append(records, target)
	if err := SaveConflicts(context.Adapters.Home, records, context.Options.Now); err != nil {
		return err
	}

	path := placement.CheckoutPath(context.Options.Cwd, target.Root, target.Path)
	mineKind := "live"

	if mine == nil {
		mineKind = "deleted"
	}

	context.Report(output.SanitizeTerminal(presentation.ConflictNotice(presentation.Notice{Path: path, File: file, Device: device, Keys: marked.Keys, Marked: mine != nil && server != nil, Mine: mineKind, Theirs: theirs.Kind})))

	return nil
}
