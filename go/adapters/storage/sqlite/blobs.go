package sqlite

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	envErrors "github.com/notsuhas/envden/go/core/errors"
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

func (s *storage) putBlob(v, h, b []byte, verify func([]byte) ([]byte, error), now, quota int64) error {
	if verify != nil {
		hash, e := verify(b)
		if err := e; err != nil {
			return err
		}
		if !bytes.Equal(hash, h) {
			return storageFailure("Blob hash mismatch")
		}
	}
	if quota == 0 {
		quota = 1 << 30
	}

	return s.tx(func() error {
		used, err := s.vaultUsage(v)
		if err != nil {
			return err
		}

		prior, err := s.count("SELECT COALESCE((SELECT size FROM blob_usage WHERE vault=? AND hash=?),0)", v, h)
		if err != nil {
			return err
		}
		if err := s.checkQuota(v, used, used-prior+int64(len(b)), quota); err != nil {
			return err
		}

		path := s.blobPath(v, h)
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0700); err != nil {
			return err
		}

		temp := filepath.Join(dir, ".tmp-"+uuid.NewString())
		defer func() { _ = os.Remove(temp) }()
		f, e := os.OpenFile(temp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err := e; err != nil {
			return err
		}
		if err := func() error {
			defer func() { _ = f.Close() }()
			_, e = f.Write(b)
			if err := e; err != nil {
				return err
			}

			return f.Sync()
		}(); err != nil {
			return err
		}

		e = os.Link(temp, path)
		if e != nil {
			prior, e := os.ReadFile(path)
			if err := e; err != nil {
				return err
			}
			if !bytes.Equal(prior, b) {
				return storageFailure("Conflicting content for blob hash")
			}
		}
		if err := syncDir(dir); err != nil {
			return err
		}
		_, err = s.run("INSERT OR IGNORE INTO blobs VALUES(?,?)", v, h)
		if err != nil {
			return err
		}

		_, err = s.run("INSERT INTO blob_usage VALUES(?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at", v, h, len(b), now)
		if err != nil {
			return err
		}

		return nil
	})
}

func (s *storage) getBlob(v, h []byte) ([]byte, error) {
	bytesResult, err := s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h)
	if err != nil {
		return nil, err
	}
	if bytesResult == nil {
		return nil, nil
	}
	b, e := os.ReadFile(s.blobPath(v, h))
	if os.IsNotExist(e) {
		return nil, nil
	}
	if err := e; err != nil {
		return nil, err
	}

	return b, nil
}

func (s *storage) hasBlob(v, h []byte) (bool, error) {
	bytesResult, err := s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h)
	if err != nil {
		return false, err
	}
	if bytesResult == nil {
		return false, nil
	}
	_, e := os.Stat(s.blobPath(v, h))

	return e == nil, nil
}

func (s *storage) blobHashes(v []byte) ([][]byte, error) {
	r, err := s.rows("SELECT hash FROM blobs WHERE vault=? ORDER BY hash", v)
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

func (s *storage) vaultUsage(v []byte) (int64, error) {
	return s.count(`SELECT (SELECT COALESCE(SUM(size),0) FROM blob_usage WHERE vault=?)+(SELECT COALESCE(SUM(length(bytes)),0) FROM lists WHERE vault=?)+(SELECT COALESCE(SUM(length(bytes)),0) FROM state WHERE vault=? AND kind='keyring')+(SELECT COALESCE(SUM(length(list)+length(file)+length(version)+COALESCE(length(blob),0)+1),0) FROM versions WHERE vault=?)`, v, v, v, v)
}

func (s *storage) checkQuota(v []byte, before, after, limit int64) error {
	state, err := s.vault(v)
	if err != nil {
		return err
	}

	importing := state != nil && (!state.Active || state.Restored != nil)
	if !importing && after > limit && after > before {
		return envErrors.New("STORAGE_QUOTA", "Vault storage quota exceeded")
	}

	return nil
}
