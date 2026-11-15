package sqlite

import (
	"bytes"
	"fmt"
	"github.com/notsuhas/envden/go/core/adapters"
	"strconv"
)

func seq(n uint64) string { return fmt.Sprintf("%020d", n) }

func (s *storage) chain(table string, v []byte, from, to uint64, limit, maxBytes int) []adapters.StoredHeader {
	if limit == 0 {
		limit = 2147483647
	}
	if maxBytes == 0 {
		maxBytes = 9007199254740991
	}
	return s.chainRows(`SELECT hash,bytes,seq FROM (SELECT hash,bytes,seq,SUM(length(bytes)) OVER (ORDER BY seq) AS total,ROW_NUMBER() OVER (ORDER BY seq) AS position FROM (SELECT hash,bytes,seq FROM `+table+` WHERE vault=? AND seq BETWEEN ? AND ? ORDER BY seq LIMIT ?)) WHERE total<=? OR position=1 ORDER BY seq`, v, seq(from), seq(to), limit, maxBytes)
}

func (s *storage) chainRows(q string, args ...any) []adapters.StoredHeader {
	r := s.rows(q, args...)
	defer r.Close()
	out := []adapters.StoredHeader{}
	for r.Next() {
		var row adapters.StoredHeader
		var n string
		must(r.Scan(&row.Hash, &row.Bytes, &n))
		i, e := strconv.ParseUint(n, 10, 64)
		must(e)
		row.Seq = i
		out = append(out, row)
	}
	must(r.Err())
	return out
}

func (s *storage) headers(v []byte, from, to uint64, limit, maxBytes int) []adapters.StoredHeader {
	return s.chain("headers", v, from, to, limit, maxBytes)
}

func (s *storage) entries(v []byte, from, to uint64, limit, maxBytes int) []adapters.StoredHeader {
	return s.chain("entries", v, from, to, limit, maxBytes)
}

func (s *storage) header(v, h []byte) *adapters.StoredHeader {
	rows := s.chainRows("SELECT hash,bytes,seq FROM headers WHERE vault=? AND hash=?", v, h)
	if len(rows) == 0 {
		return nil
	}
	return &rows[0]
}

func (s *storage) headersForFiles(v, h []byte) []adapters.StoredHeader {
	return s.chainRows(`SELECT hash,bytes,seq FROM headers WHERE vault=? AND files=? UNION SELECT n.hash,n.bytes,n.seq FROM headers p JOIN headers n ON n.vault=p.vault AND n.seq=(SELECT MIN(seq) FROM headers WHERE vault=p.vault AND seq>p.seq) WHERE p.vault=? AND p.files=? ORDER BY seq`, v, h, v, h)
}

func (s *storage) fileList(v, h []byte) []byte {
	return s.bytes("SELECT bytes FROM lists WHERE vault=? AND hash=?", v, h)
}

func (s *storage) putFileList(v []byte, f adapters.StoredFiles, now int64) {
	s.tx(func() {
		s.run("INSERT INTO lists VALUES(?,?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at,permanent=MAX(permanent,excluded.permanent)", v, f.Hash, f.Bytes, now, bit(f.RetainForever))
		for _, version := range f.Versions {
			s.run("INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)", v, f.Hash, version.FileID, seq(version.Version), optional(version.BlobHash), bit(version.Tombstone))
		}
	})
}

func (s *storage) findCommitted(v, d []byte) bool {
	return s.bytes("SELECT digest AS bytes FROM digests WHERE vault=? AND digest=?", v, d) != nil
}

func (s *storage) commitSwap(v, expected []byte, swap adapters.StoredSwap, now int64) adapters.CommitResult {
	var result adapters.CommitResult
	s.tx(func() {
		if s.findCommitted(v, swap.BodyDigest) {
			result.Kind = adapters.RetryOfCommitted
			return
		}
		head := s.head(v)
		if !sameBytes(head, expected) {
			result = adapters.CommitResult{Kind: adapters.HeadMovedResult, Head: head}
			return
		}
		before := s.vaultUsage(v)
		must(adapters.PrepareCommit(s, v, swap, now))
		priorFiles := s.bytes("SELECT files AS bytes FROM headers WHERE vault=? ORDER BY seq DESC LIMIT 1", v)
		adds := swap.Files == nil || s.addsContent(v, priorFiles, *swap.Files)
		if swap.Files != nil {
			s.putFileList(v, *swap.Files, now)
			if swap.Files.RetainForever && priorFiles != nil {
				s.run("UPDATE lists SET permanent=1 WHERE vault=? AND hash=?", v, priorFiles)
			}
		}
		files := swap.FilesHash
		if files == nil && swap.Files != nil {
			files = swap.Files.Hash
		}
		if files == nil {
			files = priorFiles
		}
		if files != nil {
			s.run("UPDATE lists SET at=? WHERE vault=? AND hash=?", now, v, files)
		}
		s.run("INSERT INTO headers VALUES(?,?,?,?,?,?)", v, seq(swap.Header.Seq), swap.Header.Hash, swap.Header.Bytes, now, optional(files))
		for _, entry := range swap.Entries {
			s.run("INSERT INTO entries VALUES(?,?,?,?)", v, seq(entry.Seq), entry.Hash, entry.Bytes)
		}
		if adds {
			s.checkQuota(v, before, s.vaultUsage(v), 1<<30)
		}
		must(adapters.WriteCommitState(s, v, swap))
		if swap.Approver != nil {
			s.run("INSERT OR REPLACE INTO approvers VALUES(?,?,?,?)", v, swap.Approver.Device, swap.Approver.Bytes, now+86400000)
		}
		if swap.ClearRepairReports {
			s.run("DELETE FROM state WHERE vault=? AND kind='repair-report'", v)
		}
		if swap.CloseMailbox != nil {
			s.closeMailbox(v, *swap.CloseMailbox)
		}
		if swap.SetupTokenHash != nil {
			s.run("DELETE FROM setup")
		}
		s.run("INSERT INTO digests VALUES(?,?)", v, swap.BodyDigest)
		s.run("UPDATE vaults SET head=? WHERE id=?", swap.Header.Hash, v)
		result.Kind = adapters.Committed
	})
	return result
}

func sameBytes(a, b []byte) bool { return (a == nil) == (b == nil) && bytes.Equal(a, b) }

func (s *storage) addsContent(v, prior []byte, next adapters.StoredFiles) bool {
	if prior == nil {
		return true
	}
	old := s.fileList(v, prior)
	if old == nil || len(next.Bytes) > len(old) {
		return true
	}
	r := s.rows("SELECT blob FROM versions WHERE vault=? AND list=? AND blob IS NOT NULL", v, prior)
	defer r.Close()
	blobs := map[string]bool{}
	for r.Next() {
		var b []byte
		must(r.Scan(&b))
		blobs[string(b)] = true
	}
	must(r.Close())
	for _, version := range next.Versions {
		if version.BlobHash != nil && !blobs[string(version.BlobHash)] {
			return true
		}
	}
	return false
}
