package self

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/updates/check"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"github.com/notsuhas/envden/go/core/release"
)

func DownloadUpdate(ctx context.Context, fetch client.Fetch, running, platform string) ([]byte, error) {
	latest, e := check.LatestRelease(ctx, fetch)
	if e != nil {
		return nil, e
	}

	n, e := versions.CompareSemver(latest, running)
	if e != nil {
		return nil, e
	}

	if n <= 0 {
		return nil, nil
	}

	name := "envden-" + platform
	if strings.HasPrefix(platform, "windows-") {
		name += ".exe"
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()
	get := func(name, message string) ([]byte, error) {
		r, _ := http.NewRequestWithContext(ctx, "GET", check.ReleaseAssetURL(latest, name), nil)
		response, e := follow(fetch, r)
		if e != nil {
			return nil, e
		}

		defer func() { _ = response.Body.Close() }() // Best-effort cleanup must not replace the operation result.
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, errors.New(errors.InvalidData, message)
		}

		return io.ReadAll(response.Body)
	}
	sums, e := get("SHA256SUMS", "Release checksums download failed")
	if e != nil {
		return nil, e
	}

	hashes, e := release.ParseSha256Sums(string(sums))
	if e != nil {
		return nil, e
	}

	hash, ok := hashes[name]
	if !ok {
		return nil, errors.New(errors.InvalidData, "No release build for this platform")
	}

	bytes, e := get(name, "Build download failed")
	if e != nil {
		return nil, e
	}

	digest := sha256.Sum256(bytes)
	if hex.EncodeToString(digest[:]) != hash {
		return nil, errors.New(errors.InvalidData, "Build checksum mismatch")
	}

	return bytes, nil
}
