package pako

import (
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"testing"
)

func TestPakoGoldens(t *testing.T) {
	raw, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors []struct {
		Kind         string
		Size, Length int
		SHA256, Hex  string
	}
	if err = json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	for _, v := range vectors {
		t.Run(fmt.Sprintf("%s/%d", v.Kind, v.Size), func(t *testing.T) {
			input := make([]byte, v.Size)
			seed := uint32(42)
			for i := range input {
				seed = seed*1664525 + 1013904223
				switch v.Kind {
				case "random":
					input[i] = byte(seed >> 24)
				case "repeat":
					input[i] = 97
				case "ramp":
					input[i] = byte(i % 256)
				case "mixed":
					if i%1024 < 800 {
						input[i] = byte(i % 23)
					} else {
						input[i] = byte(seed >> 24)
					}
				}
			}
			compressed := Deflate(input)
			if v.Hex != "" {
				expected, err := hex.DecodeString(v.Hex)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(compressed, expected) {
					t.Fatal("pako bytes differ")
				}
			}
			if len(compressed) != v.Length || fmt.Sprintf("%x", sha256.Sum256(compressed)) != v.SHA256 {
				t.Fatalf("pako mismatch: length %d, sha256 %x", len(compressed), sha256.Sum256(compressed))
			}
			reader, err := zlib.NewReader(bytes.NewReader(compressed))
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := io.ReadAll(reader)
			reader.Close()
			if err != nil || !bytes.Equal(decoded, input) {
				t.Fatal("round trip differs", err)
			}
		})
	}
}
