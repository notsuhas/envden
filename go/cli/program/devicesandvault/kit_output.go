package devicesandvault

import (
	"fmt"
	"io"

	admin "github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/output"
)

func printKit(stdout io.Writer, kit admin.ReplacementKit) {
	_, _ = fmt.Fprintln(stdout, output.SanitizeConsole(fmt.Sprintf("Recovery kit\nKeep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.\n\n  Vault ID:    %s\n  Secret key:  %s\n  Server:      %s", kit.VaultID, kit.SecretKey, kit.Server)))
}
