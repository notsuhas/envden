package pdf

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/core/process"
)

func KitFolder(home string) string {
	downloads := filepath.Join(home, "Downloads")
	stat, err := os.Stat(downloads)
	if err == nil && stat.IsDir() {
		return downloads
	}

	return home
}

func KitFileName(vaultID string, copy int) string {
	if len(vaultID) > 6 {
		vaultID = vaultID[:6]
	}

	base := "envden Recovery Kit " + vaultID
	if copy == 1 {
		return base + ".pdf"
	}

	return fmt.Sprintf("%s (%d).pdf", base, copy)
}

func WriteKitPDF(folder, vaultID string, raw []byte) (string, error) {
	for copy := 1; ; copy++ {
		path := filepath.Join(folder, KitFileName(vaultID, copy))
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if os.IsExist(err) {
			continue
		}

		if err != nil {
			return "", err
		}

		err = process.RestrictAccess(path, false)
		if err == nil {
			_, err = file.Write(raw)
		}

		closeErr := file.Close()
		if err == nil {
			err = closeErr
		}

		if err != nil {
			_ = os.Remove(path) // Best-effort cleanup preserves the original operation result.

			return "", err
		}

		return path, nil
	}
}
