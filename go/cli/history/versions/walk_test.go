package versions

import (
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"testing"
)

func TestWalkVersions(t *testing.T) {
	id := []byte{1}
	other := []byte{2}
	headers := []b.Signed[m.ManifestHeader]{}
	for i, hash := range []byte{1, 2, 2, 3} {
		headers = append(headers, b.Signed[m.ManifestHeader]{Body: m.ManifestHeader{Seq: uint64(i + 1), FilesHash: []byte{hash}}})
	}
	for _, prune := range []bool{false, true} {
		calls := map[byte]int{}
		walks, err := WalkVersions(headers, [][]byte{id, other}, func(hash []byte) (*m.Files, error) {
			calls[hash[0]]++
			if hash[0] == 1 {
				if prune {
					return nil, nil
				}
				return &m.Files{Entries: []m.FileEntry{}}, nil
			}
			return &m.Files{Entries: []m.FileEntry{{FileId: id, Version: uint64(hash[0] - 1)}}}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		walk := walks[b.Base32(id)]
		if len(walk.Versions) != 2 || walk.Versions[0].Entry.Version != 2 || walk.Versions[0].Header.Body.Seq != 4 || walk.Versions[1].Entry.Version != 1 || walk.Pruned != prune {
			t.Fatal(walk)
		}
		if prune {
			if walk.Versions[1].Header != nil {
				t.Fatal("pruned origin must be unknown")
			}
		} else if walk.Versions[1].Header.Body.Seq != 2 {
			t.Fatal("oldest listing is the origin")
		}
		if calls[2] != 1 {
			t.Fatal("repeated lists must be downloaded once", calls)
		}
		if len(walks[b.Base32(other)].Versions) != 0 || walks[b.Base32(other)].Pruned {
			t.Fatal("absence ends the walk")
		}
	}
}

func TestMatchingVersion(t *testing.T) {
	vs := []RetainedVersion{{Version: 3, Content: []byte("new")}, {Version: 2, Content: nil}, {Version: 1, Content: []byte{}}}
	for _, c := range []struct {
		content []byte
		want    uint64
	}{{[]byte("new"), 3}, {nil, 2}, {[]byte{}, 1}, {[]byte("unknown"), 0}} {
		got := MatchingVersion(vs, c.content)
		if c.want == 0 {
			if got != nil {
				t.Fatal(got)
			}
		} else if got == nil || *got != c.want {
			t.Fatal(c, got)
		}
	}
}
