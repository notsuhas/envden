package memory

import (
	"fmt"
	"sort"

	"github.com/notsuhas/envden/go/core/adapters"
)

func (m *memory) prune(v []byte, p adapters.HistoryPolicy, now int64) adapters.PruneResult {
	if p.MaxAge < 0 || p.MinVersions < 1 {
		fail("Invalid history policy")
	}
	if m.depth != 0 {
		fail("Pruning must run outside an application transaction")
	}
	key := hexKey(v)
	versions := map[string][]uint64{}
	for _, l := range m.data.Lists {
		if l.Vault != key {
			continue
		}
		for _, v := range l.Files.Versions {
			k := hexKey(v.FileID)
			found := false
			for _, n := range versions[k] {
				if n == v.Version {
					found = true
				}
			}
			if !found {
				versions[k] = append(versions[k], v.Version)
			}
		}
	}
	for k, values := range versions {
		sort.Slice(values, func(i, j int) bool { return values[i] > values[j] })
		versions[k] = values[:min(len(values), p.MinVersions)]
	}
	ranked := func(v adapters.FileVersion) bool {
		for _, n := range versions[hexKey(v.FileID)] {
			if n == v.Version {
				return true
			}
		}

		return false
	}
	retained := map[string]string{}
	candidates := map[string]bool{}
	for k, l := range m.data.Lists {
		if l.Vault != key {
			continue
		}
		for _, v := range l.Files.Versions {
			if v.BlobHash != nil {
				candidates[hexKey(v.BlobHash)] = true
			}
			if ranked(v) {
				vk := fmt.Sprintf("%s:%d", hexKey(v.FileID), v.Version)
				prior, ok := retained[vk]
				if !ok || k < prior {
					retained[vk] = k
				}
			}
		}
	}
	out := adapters.PruneResult{}
	for k, l := range m.data.Lists {
		if l.Vault != key {
			continue
		}
		keep := false
		for _, lk := range retained {
			if lk == k {
				keep = true
			}
		}
		if l.At < now-p.MaxAge && !l.Permanent && m.data.CurrentFiles[key] != k && !keep {
			delete(m.data.Lists, k)
			out.Lists++
		}
	}
	kept := map[string]bool{}
	for _, l := range m.data.Lists {
		if l.Vault != key {
			continue
		}
		for _, v := range l.Files.Versions {
			if v.BlobHash != nil && (l.At >= now-p.MaxAge || ranked(v)) {
				kept[hexKey(v.BlobHash)] = true
			}
		}
	}
	for _, b := range m.data.Blobs {
		if b.Vault == key && b.At < now-86400000 && !kept[hexKey(b.Hash)] {
			candidates[hexKey(b.Hash)] = true
		}
	}
	for hash := range candidates {
		if !kept[hash] {
			k := key + ":" + hash
			if _, ok := m.data.Blobs[k]; ok {
				delete(m.data.Blobs, k)
				m.forget("blobs", k)
				out.Blobs++
			}
		}
	}

	return out
}
