package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/repair/finish"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/output/render"
	rt "github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/lib/commander"
	"os"
)

func serverRepairAction(i *commander.Invocation) error {
	env, err := rt.Get(i)
	if err != nil {
		return err
	}
	a := env.Adapters
	var supplied *string
	if text, ok := i.Values["repairToken"].(string); ok {
		supplied = &text
	}
	token, err := prompts.ReadToken("repair", supplied, os.Stdin, env.Interactive)
	if err != nil {
		return err
	}
	if yes, _ := i.Values["finish"].(bool); yes {
		password, err := prompts.Secret("Master password")
		if err != nil {
			return err
		}
		without, _ := i.Values["without"].([]string)
		accept, _ := i.Values["acceptLost"].(bool)
		result, err := finish.FinishRepair(env.Context, a, finish.Options{Token: token, Password: password, Without: without, AcceptLost: accept, Now: a.Now, Fetcher: a.Fetcher})
		if err != nil {
			return err
		}
		if err = rt.Print(i, repairText(result)); err != nil {
			return err
		}
		if result.Kind == "finished" && result.ReplaceKit {
			yes, e := prompts.Consent("Replace the recovery kit now?", false)
			if e != nil {
				return e
			}
			if yes {
				return vaultAction("replace")(i)
			}
		}
		return nil
	}
	if _, err = repair.UploadRepair(env.Context, a, token, a.Now, a.Fetcher); err != nil {
		return err
	}
	return rt.Print(i, "Uploaded this device's data. Once every device has done this, run envden server repair --finish")
}

func repairText(r repair.Result) string { return render.RepairText(r) }
