package report

import (
	"github.com/notsuhas/envden/go/cli/state/files"
	"path/filepath"
	"strings"
	"time"
)

func WriteReport(home, document string, now func() int64) (string, error) {
	directory := filepath.Join(home, "reports")
	if e := files.PrivateDirectory(directory); e != nil {
		return "", e
	}
	date := time.UnixMilli(now()).UTC().Format("2006-01-02T15:04:05.000Z")
	path := filepath.Join(directory, strings.NewReplacer(":", "-", ".", "-").Replace(date)+".md")
	return path, files.AtomicWrite(path, []byte(document), now)
}
