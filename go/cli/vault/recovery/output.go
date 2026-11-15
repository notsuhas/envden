package recovery

import (
	"bytes"
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"os"
)

func WriteKit(path string, kit any) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return errors.Wrap(errors.InvalidInput, "Cannot create recovery kit; choose a new --kit-out path in an existing directory", err)
	}
	defer file.Close()
	if err = process.RestrictAccess(path, false); err != nil {
		return err
	}
	raw, err := jsonvalue.Marshal(kit)
	if err != nil {
		return err
	}
	var pretty bytes.Buffer
	if err = json.Indent(&pretty, raw, "", "  "); err != nil {
		return err
	}
	_, err = file.Write(pretty.Bytes())
	return err
}
