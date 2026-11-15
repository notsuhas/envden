package sqlite

import (
	"errors"
	"github.com/notsuhas/envden/go/core/adapters"
)

const ranked = `WITH ranked AS (SELECT file,version FROM (SELECT DISTINCT file,version,DENSE_RANK() OVER (PARTITION BY file ORDER BY version DESC) AS rank FROM versions WHERE vault=?1) WHERE rank<=?3)`

func (s *storage) hashes(q string, args ...any) [][]byte {
	r := s.rows(q, args...)
	defer r.Close()
	out := [][]byte{}
	for r.Next() {
		var b []byte
		must(r.Scan(&b))
		out = append(out, b)
	}
	must(r.Err())
	return out
}

func (s *storage) prune(v []byte, p adapters.HistoryPolicy, now int64) adapters.PruneResult {
	if p.MaxAge < 0 || p.MinVersions < 1 {
		panic(errors.New("Invalid history policy"))
	}
	if s.depth != 0 {
		panic(errors.New("Pruning must run outside an application transaction"))
	}
	s.maintain(now)
	var out adapters.PruneResult
	s.tx(func() {
		candidates := s.hashes("SELECT DISTINCT blob AS hash FROM versions WHERE vault=? AND blob IS NOT NULL", v)
		candidates = append(candidates, s.hashes("SELECT hash FROM blob_usage WHERE vault=? AND at<? AND hash NOT IN (SELECT blob FROM versions WHERE vault=blob_usage.vault AND blob IS NOT NULL)", v, now-86400000)...)
		cutoff := now - p.MaxAge
		removed := s.hashes(ranked+` DELETE FROM lists WHERE vault=?1 AND at<?2 AND permanent=0 AND hash NOT IN (SELECT files FROM headers WHERE vault=?1 ORDER BY seq DESC LIMIT 1) AND hash NOT IN (SELECT MIN(list) FROM versions WHERE vault=?1 AND (file,version) IN ranked GROUP BY file,version) RETURNING hash`, v, cutoff, p.MinVersions)
		out.Lists = len(removed)
		retained := map[string]bool{}
		for _, h := range s.hashes(ranked+` SELECT DISTINCT v.blob AS hash FROM versions v JOIN lists l ON l.vault=v.vault AND l.hash=v.list WHERE v.vault=?1 AND v.blob IS NOT NULL AND (l.at>=?2 OR (v.file,v.version) IN ranked)`, v, cutoff, p.MinVersions) {
			retained[string(h)] = true
		}
		for _, h := range candidates {
			if retained[string(h)] {
				continue
			}
			s.run("DELETE FROM blob_usage WHERE vault=? AND hash=?", v, h)
			s.run("INSERT OR IGNORE INTO blob_garbage VALUES(?,?)", v, h)
			out.Blobs += int(s.run("DELETE FROM blobs WHERE vault=? AND hash=?", v, h))
		}
	})
	s.collectGarbage()
	return out
}
