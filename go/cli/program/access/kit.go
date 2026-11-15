package access

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/ui"
	"github.com/notsuhas/envden/go/cli/vault"
	pdf "github.com/notsuhas/envden/go/cli/vault/recovery/pdf"
	"io"
	"strings"
)

func ReportKit(a contracts.Adapters, p onboarding.Prompts, stdout io.Writer, kit vault.SetupKit, name string) error {
	document, err := pdf.KitDocument(kit.VaultID, kit.SecretKey, kit.Server, name, a.Now())
	var path string
	if err == nil {
		var raw []byte
		raw, err = pdf.RenderKit(document, a.Now())
		if err == nil {
			path, err = pdf.WriteKitPDF(pdf.KitFolder(a.UserHome), kit.VaultID, raw)
		}
	}
	if err != nil {
		fmt.Fprintln(p.Stderr, "envden: Couldn't write the recovery kit file; save the kit printed below")
		fmt.Fprintln(stdout, output.SanitizeConsole(fmt.Sprintf("Recovery kit\nKeep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.\n\n  Vault ID:    %s\n  Secret key:  %s\n  Server:      %s", kit.VaultID, kit.SecretKey, kit.Server)))
		for p.Interactive {
			yes, err := p.Consent("Saved the recovery kit?", false)
			if err != nil {
				return err
			}
			if yes {
				break
			}
		}
		return nil
	}
	shown := path
	if strings.HasPrefix(path, a.UserHome+"/") {
		shown = "~" + strings.TrimPrefix(path, a.UserHome)
	}
	fmt.Fprintf(stdout, "Recovery kit saved to %s\nPrint it or store it offline, then delete the file from this computer.\n", output.SanitizeConsole(shown))
	if p.Interactive {
		open, err := p.Consent("Open it now?", true)
		if err != nil {
			return err
		}
		if open && !ui.OpenBrowser(path) {
			fmt.Fprintln(p.Stderr, "envden: Couldn't open the kit; open the file above yourself")
		}
	}
	return nil
}
