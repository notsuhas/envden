package sqlite

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	coreprotocolcrypto "github.com/notsuhas/envden/go/core/protocol/crypto"
)

var contentName = regexp.MustCompile(`^(?:[a-f0-9]+|empty)$`)

func (s *storage) recoverBlobs(now int64) error {
	root := filepath.Join(s.dir, "blobs")
	vaults, e := os.ReadDir(root)
	if os.IsNotExist(e) {
		return nil
	}
	if err := e; err != nil {
		return err
	}

	for _, vault := range vaults {
		if !vault.IsDir() || !contentName.MatchString(vault.Name()) {
			continue
		}
		v := decodeName(vault.Name())
		dir := filepath.Join(root, vault.Name())
		files, e := os.ReadDir(dir)
		if err := e; err != nil {
			return err
		}

		for _, file := range files {
			info, e := file.Info()
			if err := e; err != nil {
				return err
			}
			if !info.Mode().IsRegular() {
				continue
			}
			temporary := strings.HasPrefix(file.Name(), ".tmp-")
			if !temporary && !contentName.MatchString(file.Name()) {
				continue
			}
			h := decodeName(file.Name())
			path := filepath.Join(dir, file.Name())
			removeTemporary := temporary
			if !removeTemporary {
				bytesResult, err := s.bytes("SELECT hash AS bytes FROM blob_garbage WHERE vault=? AND hash=?", v, h)
				if err != nil {
					return err
				}
				blobRegistered := bytesResult != nil
				if blobRegistered {
					bytesResult2, err := s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h)
					if err != nil {
						return err
					}
					blobRegistered = bytesResult2 == nil
				}
				removeTemporary = (blobRegistered)
			}
			if removeTemporary {
				if err := os.Remove(path); err != nil {
					return err
				}

				continue
			}
			bytesResult3, err := s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h)
			if err != nil {
				return err
			}
			if bytesResult3 == nil {
				b, e := os.ReadFile(path)
				if err := e; err != nil {
					return err
				}
				if !bytes.Equal(blobHash(b), h) {
					if err := os.Remove(path); err != nil {
						return err
					}

					continue
				}
				_, err := s.run("INSERT OR IGNORE INTO blobs VALUES(?,?)", v, h)
				if err != nil {
					return err
				}
			}
			_, err = s.run("INSERT OR IGNORE INTO blob_usage VALUES(?,?,?,?)", v, h, info.Size(), now)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func decodeName(n string) []byte {
	if n == "empty" {
		return []byte{}
	}
	b, _ := hex.DecodeString(n)

	return b
}

func blobHash(b []byte) []byte { return coreprotocolcrypto.H("blob", b) }
