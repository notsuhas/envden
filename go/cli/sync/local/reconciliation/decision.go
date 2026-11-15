package reconciliation

import "bytes"

type ContentInput struct {
	Reappeared, Detached, Tombstone, Applied, Linked, UseStore, Choosing, Repair bool
	Recorded, Mine, Server, Previous                                             []byte
}

type Action struct {
	Kind string
	Next []byte
}

func same(a, b []byte) bool { return (a == nil) == (b == nil) && bytes.Equal(a, b) }
func DeriveContentAction(input ContentInput) Action {
	if (input.Recorded != nil || input.Reappeared) && !same(input.Mine, input.Recorded) && same(input.Mine, input.Previous) && !same(input.Server, input.Previous) {
		return Action{Kind: "conflict"}
	}
	if input.Detached {
		return Action{Kind: "detached"}
	}
	if DeriveUntrackedConflict(input) == "conflict" {
		return Action{Kind: "conflict"}
	}
	if input.Repair && input.Mine != nil {
		return Action{Kind: "repair-conflict"}
	}
	if input.Tombstone && !input.Applied && input.Previous == nil && input.Mine != nil {
		return Action{Kind: "choose"}
	}
	if input.Choosing && input.Mine != nil && !same(input.Mine, input.Server) {
		return Action{Kind: "choose"}
	}
	if (input.Linked || input.Mine != nil) && !same(input.Server, input.Previous) && !same(input.Mine, input.Previous) && !same(input.Mine, input.Server) {
		return Action{Kind: "choose"}
	}

	return Action{Kind: "write", Next: DeriveDefaultContent(input)}
}

func DeriveDefaultContent(input ContentInput) []byte {
	if (input.Linked || input.UseStore && input.Mine != nil) && same(input.Server, input.Previous) {
		return input.Mine
	}

	return input.Server
}

func DeriveStoreSource(mode, status string, linked bool) bool {
	return mode == "link" && status != "detached" && (linked || status == "missing" || status == "linked")
}

func DeriveUntrackedConflict(input ContentInput) string {
	if !input.Linked && !input.UseStore && input.Mine != nil && !same(input.Mine, input.Server) && !input.Choosing {
		return "conflict"
	}

	return "continue"
}

func NeedsConflict(kind string, choosing, detachedChoice bool) bool {
	return kind == "conflict" || kind == "repair-conflict" || kind == "detached" && !choosing && !detachedChoice
}
