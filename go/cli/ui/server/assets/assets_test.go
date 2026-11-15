package assets

import (
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestReferenceAssetBytes(t *testing.T) {
	assets, err := PageAssets()
	if err != nil {
		t.Fatal(err)
	}

	for path, want := range map[string]string{
		"/chunk-71vsc44b.css": "0512837b9695d211d0b547fb88872371e09e8729892959fe147ffb04f767e3b0",
		"/chunk-yq6gjs3r.js":  "43a022c5798a1d6b86dd5508f05ec0ecd401af61438dec482e642945370ac181",
		"/":                   "28a33073079671c6b094b28c6239f8d34453e4173fd16f4e7d4a6906cf6b9a2c",
	} {
		asset, ok := assets[path]
		if !ok {
			t.Fatal("missing", path)
		}

		if got := fmt.Sprintf("%x", sha256.Sum256(asset.Body)); got != want {
			t.Fatalf("%s: %s", path, got)
		}
	}

	if len(assets) != 3 {
		t.Fatal("extra assets", len(assets))
	}
}
