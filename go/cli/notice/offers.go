package notice

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/core/adapters"
	"path/filepath"
	"sort"
	"strings"
)

func CacheOffers(a contracts.Adapters, s *model.State, cwd string, update updates.Status, now int64) error {
	path := filepath.Join(a.Home, "state", "track-offers")
	raw, e := files.OptionalRead(path)
	if e != nil {
		return e
	}
	roots := []string{}
	if raw != nil {
		for _, r := range strings.Split(*raw, "\n") {
			if safeRoot(r) {
				roots = appendUnique(roots, r)
			}
		}
	}
	if cwd != "" {
		c, _ := a.Repo.CheckoutAt(cwd)
		if c != nil && safeRoot(c.Root) {
			approved := false
			for _, v := range s.Approved {
				if v.Root == c.Root {
					approved = true
				}
			}
			known := false
			for _, r := range roots {
				if r == c.Root {
					known = true
				}
			}
			if !approved && !known {
				if e = scanOffer(a, *c, now, &roots); e != nil {
					return e
				}
			}
		}
	}
	pending := []string{}
	for _, r := range roots {
		approved := false
		for _, c := range s.Approved {
			if c.Root == r {
				approved = true
			}
		}
		if !approved {
			pending = append(pending, r)
		}
	}
	if e = files.AtomicWrite(path, []byte(linesText(pending)), a.Now); e != nil {
		return e
	}
	lines := []string{}
	if update.Available {
		lines = append(lines, "envden: update available; run envden update")
	}
	if update.Required {
		lines = append(lines, "envden: update required; run envden update")
	}
	return files.AtomicWrite(filepath.Join(a.Home, "state", "notice-update"), []byte(linesText(lines)), a.Now)
}
func scanOffer(a contracts.Adapters, c adapters.Checkout, now int64, roots *[]string) error {
	path := filepath.Join(a.Home, "state", "track-scanned.json")
	raw, e := files.OptionalRead(path)
	if e != nil {
		return e
	}
	scans := jsonvalue.Object{}
	if raw != nil {
		parsed, e := jsonvalue.Parse([]byte(*raw))
		if e != nil {
			return e
		}
		if o, ok := parsed.(jsonvalue.Object); ok {
			for _, f := range o {
				number, ok := f.Value.(json.Number)
				at, _ := number.Float64()
				if ok && now-int64(at) < 60000 {
					scans.Set(f.Key, number)
				}
			}
		}
	}
	sort.SliceStable(scans, func(i, j int) bool {
		a, _ := scans[i].Value.(json.Number).Float64()
		b, _ := scans[j].Value.(json.Number).Float64()
		return a > b
	})
	if len(scans) > 255 {
		scans = scans[:255]
	}
	number, ok := scans.Get(c.Root).(json.Number)
	at, _ := number.Float64()
	if ok && now-int64(at) < 60000 {
		return nil
	}
	config, e := settings.ReadConfig(a.Home)
	if e != nil {
		return e
	}
	var rules *adapters.EnvFileRules
	if config.EnvFiles != nil {
		b, _ := jsonvalue.Marshal(config.EnvFiles)
		rules = &adapters.EnvFileRules{}
		_ = json.Unmarshal(b, rules)
	}
	found, e := a.Repo.EnvFiles(c, rules)
	if e != nil {
		return e
	}
	if len(found) > 0 {
		*roots = appendUnique(*roots, c.Root)
	}
	scans.Set(c.Root, now)
	data, e := jsonvalue.Marshal(scans)
	if e != nil {
		return e
	}
	return files.AtomicWrite(path, data, a.Now)
}
