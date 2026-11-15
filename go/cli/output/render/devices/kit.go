package devices

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/output"
	"io"
	"strings"
)

type Kit struct{ VaultID, SecretKey, Server string }

func KitText(kit Kit) string {
	return output.SanitizeConsole(strings.Join([]string{"Recovery kit", "Keep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.", "", "  Vault ID:    " + kit.VaultID, "  Secret key:  " + kit.SecretKey, "  Server:      " + kit.Server}, "\n"))
}
func PrintKit(w io.Writer, kit Kit) error { _, e := fmt.Fprintln(w, KitText(kit)); return e }
func KitSavedText(path, format string) string {
	text := "Recovery kit saved to " + path
	if format == "pdf" {
		text += "\nPrint it or store it offline, then delete the file from this computer."
	}
	return output.SanitizeConsole(text)
}
func PrintKitSaved(w io.Writer, path, format string) error {
	_, e := fmt.Fprintln(w, KitSavedText(path, format))
	return e
}
