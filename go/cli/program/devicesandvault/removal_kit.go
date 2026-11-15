package devicesandvault

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	rd "github.com/notsuhas/envden/go/cli/output/render/devices"
	rt "github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/ui"
	vr "github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/cli/vault/recovery/pdf"
	"github.com/notsuhas/envden/go/lib/commander"
)

func removalKit(i *commander.Invocation, kit recovery.ReplacementKit) error {
	env, err := rt.Get(i)
	if err != nil {
		return err
	}
	a := env.Adapters
	path, _ := i.Values["kitOut"].(string)
	if path != "" {
		if err = vr.WriteKit(path, kit); err == nil {
			return rd.PrintKitSaved(rt.Writer(i.Command, false), path, "json")
		}
		fmt.Fprintln(rt.Writer(i.Command, true), "envden: Could not save the recovery kit; save the kit printed below")
		printKit(rt.Writer(i.Command, false), kit)
		return nil
	}
	name := a.Hostname
	if s, e := store.LoadState(a.Home); e == nil && s != nil {
		name = s.DeviceName
	}
	now := a.Now()
	document, err := pdf.KitDocument(kit.VaultID, kit.SecretKey, kit.Server, name, now)
	var raw []byte
	if err == nil {
		raw, err = pdf.RenderKit(document, now)
	}
	if err == nil {
		path, err = pdf.WriteKitPDF(pdf.KitFolder(a.UserHome), kit.VaultID, raw)
	}
	if err != nil {
		fmt.Fprintln(rt.Writer(i.Command, true), "envden: Couldn't write the recovery kit file; save the kit printed below")
		printKit(rt.Writer(i.Command, false), kit)
		for env.Interactive {
			yes, e := prompts.Consent("Saved the recovery kit?", false)
			if e != nil {
				return e
			}
			if yes {
				break
			}
		}
		return nil
	}
	if err = rd.PrintKitSaved(rt.Writer(i.Command, false), output.HomePath(path, a.UserHome), "pdf"); err != nil {
		return err
	}
	if env.Interactive {
		yes, e := prompts.Consent("Open it now?", true)
		if e != nil {
			return e
		}
		if yes && !ui.OpenBrowser(path) {
			fmt.Fprintln(rt.Writer(i.Command, true), "envden: Couldn't open the kit; open the file above yourself")
		}
	}
	return nil
}
