package sqlite

import (
	"fmt"
	"strconv"

	"github.com/notsuhas/envden/go/core/adapters"
)

func seq(n uint64) string { return fmt.Sprintf("%020d", n) }

func (s *storage) chain(table string, v []byte, from, to uint64, limit, maxBytes int) ([]adapters.StoredHeader, error) {
	if limit == 0 {
		limit = 2147483647
	}
	if maxBytes == 0 {
		maxBytes = 9007199254740991
	}

	return s.chainRows(`SELECT hash,bytes,seq FROM (SELECT hash,bytes,seq,SUM(length(bytes)) OVER (ORDER BY seq) AS total,ROW_NUMBER() OVER (ORDER BY seq) AS position FROM (SELECT hash,bytes,seq FROM `+table+` WHERE vault=? AND seq BETWEEN ? AND ? ORDER BY seq LIMIT ?)) WHERE total<=? OR position=1 ORDER BY seq`, v, seq(from), seq(to), limit, maxBytes)
}

func (s *storage) chainRows(q string, args ...any) ([]adapters.StoredHeader, error) {
	r, err := s.rows(q, args...)
	if err != nil {
		return nil, err
	}

	defer func() { _ = r.Close() }()
	out := []adapters.StoredHeader{}
	for r.Next() {
		var row adapters.StoredHeader
		var n string
		if err := r.Scan(&row.Hash, &row.Bytes, &n); err != nil {
			return nil, err
		}

		i, e := strconv.ParseUint(n, 10, 64)
		if err := e; err != nil {
			return nil, err
		}

		row.Seq = i
		out = append(out, row)
	}
	if err := r.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (s *storage) headers(v []byte, from, to uint64, limit, maxBytes int) ([]adapters.StoredHeader, error) {
	return s.chain("headers", v, from, to, limit, maxBytes)
}

func (s *storage) entries(v []byte, from, to uint64, limit, maxBytes int) ([]adapters.StoredHeader, error) {
	return s.chain("entries", v, from, to, limit, maxBytes)
}

func (s *storage) header(v, h []byte) (*adapters.StoredHeader, error) {
	rows, err := s.chainRows("SELECT hash,bytes,seq FROM headers WHERE vault=? AND hash=?", v, h)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	return &rows[0], nil
}

func (s *storage) headersForFiles(v, h []byte) ([]adapters.StoredHeader, error) {
	return s.chainRows(`SELECT hash,bytes,seq FROM headers WHERE vault=? AND files=? UNION SELECT n.hash,n.bytes,n.seq FROM headers p JOIN headers n ON n.vault=p.vault AND n.seq=(SELECT MIN(seq) FROM headers WHERE vault=p.vault AND seq>p.seq) WHERE p.vault=? AND p.files=? ORDER BY seq`, v, h, v, h)
}

func (s *storage) fileList(v, h []byte) ([]byte, error) {
	return s.bytes("SELECT bytes FROM lists WHERE vault=? AND hash=?", v, h)
}

func (s *storage) putFileList(v []byte, f adapters.StoredFiles, now int64) error {
	return s.tx(func() error {
		_, err := s.run("INSERT INTO lists VALUES(?,?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at,permanent=MAX(permanent,excluded.permanent)", v, f.Hash, f.Bytes, now, bit(f.RetainForever))
		if err != nil {
			return err
		}

		for _, version := range f.Versions {
			_, err := s.run("INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)", v, f.Hash, version.FileID, seq(version.Version), optional(version.BlobHash), bit(version.Tombstone))
			if err != nil {
				return err
			}
		}

		return nil
	})
}

func (s *storage) findCommitted(v, d []byte) (bool, error) {
	bytesResult, err := s.bytes("SELECT digest AS bytes FROM digests WHERE vault=? AND digest=?", v, d)
	if err != nil {
		return false, err
	}

	return bytesResult != nil, nil
}
