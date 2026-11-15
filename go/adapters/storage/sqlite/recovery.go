package sqlite

import (
	"bytes"
	"encoding/hex"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var contentName = regexp.MustCompile(`^(?:[a-f0-9]+|empty)$`)

func (s *storage) recoverBlobs(now int64) {
	root := filepath.Join(s.dir, "blobs")
	vaults, e := os.ReadDir(root)
	if os.IsNotExist(e) {
		return
	}
	must(e)
	for _, vault := range vaults {
		if !vault.IsDir() || !contentName.MatchString(vault.Name()) {
			continue
		}
		v := decodeName(vault.Name())
		dir := filepath.Join(root, vault.Name())
		files, e := os.ReadDir(dir)
		must(e)
		for _, file := range files {
			info, e := file.Info()
			must(e)
			if !info.Mode().IsRegular() {
				continue
			}
			temporary := strings.HasPrefix(file.Name(), ".tmp-")
			if !temporary && !contentName.MatchString(file.Name()) {
				continue
			}
			h := decodeName(file.Name())
			path := filepath.Join(dir, file.Name())
			if temporary || (s.bytes("SELECT hash AS bytes FROM blob_garbage WHERE vault=? AND hash=?", v, h) != nil && s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h) == nil) {
				must(os.Remove(path))
				continue
			}
			if s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", v, h) == nil {
				b, e := os.ReadFile(path)
				must(e)
				if !bytes.Equal(blobHash(b), h) {
					must(os.Remove(path))
					continue
				}
				s.run("INSERT OR IGNORE INTO blobs VALUES(?,?)", v, h)
			}
			s.run("INSERT OR IGNORE INTO blob_usage VALUES(?,?,?,?)", v, h, info.Size(), now)
		}
	}
}

func decodeName(n string) []byte {
	if n == "empty" {
		return []byte{}
	}
	b, _ := hex.DecodeString(n)
	return b
}

func blobHash(b []byte) []byte { return c.H("blob", b) }
