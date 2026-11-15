package reconciliation

import "github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"

type FileInput struct {
	ContentInput
	Store, StoreBeforeRestore    []byte
	Copies                       []content.Copy
	Tracked, Published, Deleting bool
}

type FileDecision struct {
	Local  content.Local
	Mine   []byte
	Theirs content.Server
	Action Action
}

func DeriveFileDecision(input FileInput) FileDecision {
	store := input.Store
	if store == nil && input.Published && !input.Deleting {
		store = input.Server
	}
	remote := content.Server{Kind: "absent"}
	if input.Published {
		if input.Tombstone {
			remote.Kind = "tombstone"
		} else {
			remote = content.Server{Kind: "live", Bytes: input.Server}
		}
	}
	sides := content.DeriveFileSides(content.SidesInput{StoreBeforeRestore: input.StoreBeforeRestore, Recorded: input.Recorded, Previous: input.Previous, Server: remote, Copies: input.Copies, PendingRemoval: input.Deleting})
	ci := input.ContentInput
	ci.Linked = input.Tracked || store != nil
	ci.UseStore = true
	ci.Mine = sides.Mine
	if !input.Published {
		ci.Server = sides.Mine
	}
	action := DeriveContentAction(ci)
	if sides.Local.Kind == "conflict" {
		action = Action{Kind: "conflict"}
	}

	return FileDecision{sides.Local, sides.Mine, sides.Theirs, action}
}
