package sqlite

import (
	"github.com/notsuhas/envden/go/core/adapters"
)

const ranked = `WITH ranked AS (SELECT file,version FROM (SELECT DISTINCT file,version,DENSE_RANK() OVER (PARTITION BY file ORDER BY version DESC) AS rank FROM versions WHERE vault=?1) WHERE rank<=?3)`

func (s *storage) hashes(q string, args ...any) ([][]byte, error) {
	r, err := s.rows(q, args...)
	if err != nil {
		return nil, err
	}

	defer func() { _ = r.Close() }()
	out := [][]byte{}
	for r.Next() {
		var b []byte
		if err := r.Scan(&b); err != nil {
			return nil, err
		}

		out = append(out, b)
	}
	if err := r.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (s *storage) prune(v []byte, p adapters.HistoryPolicy, now int64) (adapters.PruneResult, error) {
	if p.MaxAge < 0 || p.MinVersions < 1 {
		return adapters.PruneResult{}, storageFailure("Invalid history policy")
	}
	if s.depth != 0 {
		return adapters.PruneResult{}, storageFailure("Pruning must run outside an application transaction")
	}
	if err := s.maintain(now); err != nil {
		return adapters.PruneResult{}, err
	}

	var out adapters.PruneResult
	if err := s.tx(func() error {
		candidates, err := s.hashes("SELECT DISTINCT blob AS hash FROM versions WHERE vault=? AND blob IS NOT NULL", v)
		if err != nil {
			return err
		}

		hashesResult, err := s.hashes("SELECT hash FROM blob_usage WHERE vault=? AND at<? AND hash NOT IN (SELECT blob FROM versions WHERE vault=blob_usage.vault AND blob IS NOT NULL)", v, now-86400000)
		if err != nil {
			return err
		}

		candidates = append(candidates, hashesResult...)
		cutoff := now - p.MaxAge
		removed, err := s.hashes(ranked+` DELETE FROM lists WHERE vault=?1 AND at<?2 AND permanent=0 AND hash NOT IN (SELECT files FROM headers WHERE vault=?1 ORDER BY seq DESC LIMIT 1) AND hash NOT IN (SELECT MIN(list) FROM versions WHERE vault=?1 AND (file,version) IN ranked GROUP BY file,version) RETURNING hash`, v, cutoff, p.MinVersions)
		if err != nil {
			return err
		}

		out.Lists = len(removed)
		retained := map[string]bool{}
		hashesResult2, err := s.hashes(ranked+` SELECT DISTINCT v.blob AS hash FROM versions v JOIN lists l ON l.vault=v.vault AND l.hash=v.list WHERE v.vault=?1 AND v.blob IS NOT NULL AND (l.at>=?2 OR (v.file,v.version) IN ranked)`, v, cutoff, p.MinVersions)
		if err != nil {
			return err
		}

		for _, h := range hashesResult2 {
			retained[string(h)] = true
		}
		for _, h := range candidates {
			if retained[string(h)] {
				continue
			}
			_, err := s.run("DELETE FROM blob_usage WHERE vault=? AND hash=?", v, h)
			if err != nil {
				return err
			}

			_, err = s.run("INSERT OR IGNORE INTO blob_garbage VALUES(?,?)", v, h)
			if err != nil {
				return err
			}

			runResult, err := s.run("DELETE FROM blobs WHERE vault=? AND hash=?", v, h)
			if err != nil {
				return err
			}

			out.Blobs += int(runResult)
		}

		return nil
	}); err != nil {
		return adapters.PruneResult{}, err
	}
	if err := s.collectGarbage(); err != nil {
		return adapters.PruneResult{}, err
	}

	return out, nil
}
