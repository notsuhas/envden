package enginetest

import (
	"bytes"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

func TestHistoryRequestsAfterCheckpoint(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	s := f.state(f.second)
	raw, err := client.Binary(s.Headers[len(s.Headers)-1])
	must(t, err)
	header, err := b.Decode(b.SignedCodec(m.ManifestHeaderCodec), raw)
	must(t, err)
	raw, err = client.Binary(s.Entries[len(s.Entries)-1])
	must(t, err)
	entry, err := b.Decode(b.SignedCodec(c.EntryCodec), raw)
	must(t, err)
	f.write(f.aStore, "TOKEN=next\n")
	f.push(f.first)
	requests := []string{}
	opts := f.opts
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1/entries" || req.URL.Path == "/v1/headers" {
			requests = append(requests, req.URL.RequestURI())
		}
		return client.DefaultFetch(req)
	}
	context, err := remote.SyncContext(f.ctx, f.second, opts, syncLinks(f))
	must(t, err)
	history, err := vault.ReadHistory(f.ctx, context.Client, context.VaultID, s)
	must(t, err)
	want := []string{"/v1/entries?from=" + strconv.FormatUint(entry.Body.Seq+1, 10), "/v1/headers?from=" + strconv.FormatUint(header.Body.Seq+1, 10), "/v1/headers?from=" + strconv.FormatUint(header.Body.Seq+2, 10)}
	equal(t, strings.Join(requests, "\n"), strings.Join(want, "\n"))
	verified, err := material.StateJSON(history.State, history.Entries)
	must(t, err)
	equal(t, bytes.Equal(verified, s.VerifiedState), true)
	equal(t, len(history.Headers), len(s.Headers)+1)
}
