package content

import "bytes"

type Server struct {
	Kind  string
	Bytes []byte
}

type Copy struct {
	Bytes, Base                   []byte
	Tracked, Detached, Historical bool
	Mode                          string
}

type SidesInput struct {
	StoreBeforeRestore, Recorded, Previous []byte
	Server                                 Server
	Copies                                 []Copy
	PendingRemoval                         bool
}

type Local struct {
	Kind     string
	Bytes    []byte
	Variants [][]byte
}

type Sides struct {
	Local  Local
	Mine   []byte
	Theirs Server
}

func same(a, b []byte) bool { return (a == nil) == (b == nil) && bytes.Equal(a, b) }

func DeriveFileSides(input SidesInput) Sides {
	remote := input.Server
	var server []byte

	if remote.Kind == "live" {
		server = remote.Bytes
	}

	store := input.StoreBeforeRestore

	if store == nil && !input.PendingRemoval {
		store = server
	}

	recorded := input.Recorded

	if recorded == nil {
		recorded = input.Previous
	}

	edited := input.PendingRemoval || input.StoreBeforeRestore != nil && (!same(input.StoreBeforeRestore, recorded) || !same(input.StoreBeforeRestore, input.Previous))
	copies := []Copy{}

	for _, copy := range input.Copies {
		if same(copy.Bytes, server) && (copy.Base == nil || same(store, input.Previous)) {
			continue
		}

		copies = append(copies, copy)
	}

	local := deriveFileContent(store, copies, input.PendingRemoval || remote.Kind == "tombstone", edited)
	var owner []byte

	if !input.PendingRemoval {
		if local.Kind == "content" {
			owner = local.Bytes
		} else if edited {
			owner = store
		} else {
			for _, v := range local.Variants {
				if v != nil {
					owner = v
					break
				}
			}
		}
	}

	if local.Kind == "conflict" && matchesServer(owner, remote) {
		for _, v := range local.Variants {
			if !matchesServer(v, remote) && v != nil {
				owner = v
				break
			}
		}
	}

	return Sides{local, owner, remote}
}

func matchesServer(value []byte, server Server) bool {
	if server.Kind == "live" {
		return same(value, server.Bytes)
	}

	return server.Kind == "tombstone" && value == nil
}

func deriveFileContent(store []byte, copies []Copy, deleted, edited bool) Local {
	edits := [][]byte{}

	for _, copy := range copies {
		for _, v := range targetEdits(store, copy, deleted, edited) {
			found := false

			for _, old := range edits {
				if same(v, old) {
					found = true
					break
				}
			}

			if !found {
				edits = append(edits, v)
			}
		}
	}

	if len(edits) > 1 {
		return Local{Kind: "conflict", Variants: edits}
	}

	if len(edits) == 1 {
		return Local{Kind: "content", Bytes: edits[0]}
	}

	return Local{Kind: "content", Bytes: store}
}

func targetEdits(store []byte, copy Copy, deleted, edited bool) [][]byte {
	if copy.Bytes == nil || same(copy.Bytes, store) || copy.Historical {
		return nil
	}

	if !copy.Tracked || copy.Base == nil {
		if edited {
			return [][]byte{store, copy.Bytes}
		}

		return [][]byte{copy.Bytes, store}
	}

	if copy.Mode == "link" {
		if same(store, copy.Base) {
			return [][]byte{copy.Bytes}
		}

		return [][]byte{store, copy.Bytes}
	}

	if same(copy.Bytes, copy.Base) {
		if store == nil && !deleted {
			return [][]byte{store, copy.Bytes}
		}

		return nil
	}

	if same(store, copy.Base) {
		return [][]byte{copy.Bytes}
	}

	if edited {
		return [][]byte{store, copy.Bytes}
	}

	return [][]byte{copy.Bytes, store}
}
