package sqlite

import (
	"bytes"
	"encoding/hex"
	"errors"
	"github.com/google/uuid"
	envErrors "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"syscall"
)

func blobName(b []byte) string {
	if len(b) == 0 {
		return "empty"
	}
	return hex.EncodeToString(b)
}

func (s *storage) blobPath(v, h []byte) string {
	return filepath.Join(s.dir, "blobs", blobName(v), blobName(h))
}

func (s *storage) putBlob(v, h, b []byte, verify func([]byte) ([]byte, error), now, quota int64) {
	if verify != nil {
		hash, e := verify(b)
		must(e)
		if !bytes.Equal(hash, h) {
			panic(errors.New("Blob hash mismatch"))
		}
	}
	if quota == 0 {
		quota = 1 << 30
	}
	s.tx(func() {
		used := s.vaultUsage(v)
		prior := s.count("SELECT COALESCE((SELECT size FROM blob_usage WHERE vault=? AND hash=?),0)", v, h)
		s.checkQuota(v, used, used-prior+int64(len(b)), quota)
		path := s.blobPath(v, h)
		dir := filepath.Dir(path)
		must(os.MkdirAll(dir, 0700))
		temp := filepath.Join(dir, ".tmp-"+uuid.NewString())
		defer os.Remove(temp)
		f, e := os.OpenFile(temp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		must(e)
		func() { defer f.Close(); _, e = f.Write(b); must(e); must(f.Sync()) }()
		if e = os.Link(temp, path); e != nil {
			prior, e := os.ReadFile(path)
			must(e)
			if !bytes.Equal(prior, b) {
				panic(errors.New("Conflicting content for blob hash"))
			}
		}
		syncDir(dir)
		s.run("INSERT OR IGNORE INTO blobs VALUES(?,?)", v, h)
		s.run("INSERT INTO blob_usage VALUES(?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at", v, h, len(b), now)
	})
}

func (s *storage) getBlob(v, h []byte) []byte {
	if s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h) == nil {
		return nil
	}
	b, e := os.ReadFile(s.blobPath(v, h))
	if os.IsNotExist(e) {
		return nil
	}
	must(e)
	return b
}

func (s *storage) hasBlob(v, h []byte) bool {
	if s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h) == nil {
		return false
	}
	_, e := os.Stat(s.blobPath(v, h))
	return e == nil
}

func (s *storage) blobHashes(v []byte) [][]byte {
	r := s.rows("SELECT hash FROM blobs WHERE vault=? ORDER BY hash", v)
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

func (s *storage) vaultUsage(v []byte) int64 {
	return s.count(`SELECT (SELECT COALESCE(SUM(size),0) FROM blob_usage WHERE vault=?)+(SELECT COALESCE(SUM(length(bytes)),0) FROM lists WHERE vault=?)+(SELECT COALESCE(SUM(length(bytes)),0) FROM state WHERE vault=? AND kind='keyring')+(SELECT COALESCE(SUM(length(list)+length(file)+length(version)+COALESCE(length(blob),0)+1),0) FROM versions WHERE vault=?)`, v, v, v, v)
}

func (s *storage) checkQuota(v []byte, before, after, limit int64) {
	state := s.vault(v)
	importing := state != nil && (!state.Active || state.Restored != nil)
	if !importing && after > limit && after > before {
		panic(envErrors.New("STORAGE_QUOTA", "Vault storage quota exceeded"))
	}
}

func (s *storage) collectGarbage() {
	if s.depth != 0 {
		return
	}
	s.tx(func() {
		r := s.rows("SELECT vault,hash FROM blob_garbage")
		defer r.Close()
		type pair struct{ v, h []byte }
		rows := []pair{}
		for r.Next() {
			var p pair
			must(r.Scan(&p.v, &p.h))
			rows = append(rows, p)
		}
		must(r.Close())
		for _, p := range rows {
			if s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", p.v, p.h) == nil {
				e := syscall.Unlink(s.blobPath(p.v, p.h))
				if e != nil && !os.IsNotExist(e) {
					continue
				}
			}
			s.run("DELETE FROM blob_garbage WHERE vault=? AND hash=?", p.v, p.h)
		}
	})
}
