package journal

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
)

func JournalPlacement(home string, state *model.State, now func() int64) error {
	value := struct {
		Checkpoint string       `json:"checkpoint,omitempty"`
		Links      []model.Link `json:"links"`
	}{state.Checkpoint, state.Links}
	b, err := jsonvalue.Marshal(value)
	if err != nil {
		return err
	}
	path := filepath.Join(home, "state", "placement.json")
	old, err := files.OptionalRead(path)
	if err != nil {
		return err
	}
	if old != nil && *old == string(b) {
		return nil
	}
	return files.AtomicWrite(path, b, now)
}

func RestorePlacement(home string, state *model.State) error {
	path := filepath.Join(home, "state", "placement.json")
	raw, err := files.OptionalRead(path)
	if err != nil || raw == nil {
		return err
	}
	var v struct {
		Checkpoint string
		Links      []model.Link
	}
	if err = json.Unmarshal([]byte(*raw), &v); err != nil {
		return errors.New(errors.InvalidData, "Invalid sync state: "+path+"; move this file aside and run envden pull")
	}
	if v.Checkpoint != state.Checkpoint || v.Links == nil {
		return nil
	}
	for _, link := range v.Links {
		found := false
		for _, item := range state.Links {
			if item.Root == link.Root && item.Path == link.Path {
				found = true
				break
			}
		}
		if !found {
			state.Links = append(state.Links, link)
		}
	}
	return nil
}

func ClearPlacement(home string) error {
	err := os.Remove(filepath.Join(home, "state", "placement.json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
