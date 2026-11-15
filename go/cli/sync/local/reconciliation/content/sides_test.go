package content

import (
	"fmt"
	"testing"
)

func value(v string) []byte {
	if v == "" {
		return nil
	}

	return []byte(v)
}

func TestReachableCopyStates(t *testing.T) {
	count := 0
	for _, store := range []string{"", "A", "B", "C"} {
		for _, recorded := range []string{"", "A", "B", "C"} {
			for _, previous := range []string{"", "A", "B", "C"} {
				for _, copy := range []string{"", "A", "B", "C"} {
					for _, base := range []string{"", "A", "B", "C"} {
						for _, server := range []string{"absent", "tombstone", "A", "B", "C"} {
							for _, pending := range []bool{false, true} {
								if pending && store != "" {
									continue
								}
								count++
								remote := Server{Kind: server}
								if server != "absent" && server != "tombstone" {
									remote = Server{Kind: "live", Bytes: value(server)}
								}
								result := DeriveFileSides(SidesInput{StoreBeforeRestore: value(store), Recorded: value(recorded), Previous: value(previous), Server: remote, PendingRemoval: pending, Copies: []Copy{{Bytes: value(copy), Base: value(base), Tracked: true, Mode: "copy", Historical: base == "" && copy != "" && copy == previous}}})
								expected := reference(store, recorded, previous, copy, base, server, pending)
								if !same(result.Mine, value(expected)) {
									t.Fatal(fmt.Sprintf("store=%q recorded=%q previous=%q copy=%q base=%q server=%q pending=%v: mine=%q want=%q", store, recorded, previous, copy, base, server, pending, result.Mine, expected))
								}
								if pending && server != "tombstone" && result.Mine != nil {
									t.Fatal("removal lost ownership")
								}
								if result.Local.Kind == "conflict" {
									for i, a := range result.Local.Variants {
										for _, b := range result.Local.Variants[i+1:] {
											if same(a, b) {
												t.Fatal("duplicate conflict variant")
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
	if count != 6400 {
		t.Fatal(count)
	}
}

func reference(store, recorded, previous, copy, base, server string, pending bool) string {
	live := server
	if server == "absent" || server == "tombstone" {
		live = ""
	}
	effective := store
	if effective == "" && !pending {
		effective = live
	}
	observed := recorded
	if observed == "" {
		observed = previous
	}
	storeEdit := store != "" && (store != observed || store != previous)
	copyEdit := copy != "" && copy != effective && !(copy == live && effective == previous)
	if base != "" {
		copyEdit = copyEdit && copy != base
	} else {
		copyEdit = copyEdit && copy != previous && copy != live
	}
	owner := effective
	if pending {
		owner = ""
	} else if storeEdit && (!copyEdit || base != effective) {
		owner = store
	} else if copyEdit {
		owner = copy
	} else if effective == "" && copy != "" && base != "" && server != "tombstone" {
		owner = copy
	}
	onServer := func(v string) bool {
		if server == "tombstone" {
			return v == ""
		}

		return server != "absent" && v == server
	}
	if !onServer(owner) || base != "" && base == effective {
		return owner
	}
	for _, edit := range []struct {
		active bool
		value  string
	}{{storeEdit, store}, {copyEdit, copy}} {
		if edit.active && edit.value != "" && edit.value != owner && !onServer(edit.value) {
			return edit.value
		}
	}

	return owner
}

func TestMissingAndEmptyAreDistinct(t *testing.T) {
	if same(nil, []byte{}) {
		t.Fatal("empty file treated as deletion")
	}
}
