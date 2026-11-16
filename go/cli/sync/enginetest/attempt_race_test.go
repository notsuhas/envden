package enginetest

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/notsuhas/envden/go/cli/client"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestLateSupersededAttempt(t *testing.T) {
	f := newFixture(t)
	target := f.layout("copy")[0]
	path := filepath.Join(target.Root, ".env")
	f.write(f.aStore, "ALPHA=a\nBETA=1\n")
	f.push(f.first)
	f.pull(f.second)
	f.write(path, "ALPHA=b\nBETA=1\n")
	var held *http.Request
	opts := f.opts
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1/swap" {
			held = req.Clone(f.ctx)
			body, err := io.ReadAll(req.Body)
			must(t, err)
			held.Body = io.NopCloser(bytes.NewReader(body))
			return nil, errors.New("Timeout")
		}
		return client.DefaultFetch(req)
	}
	_, err := syncer.Push(f.ctx, f.second, opts)
	if err == nil {
		t.Fatal("expected timeout")
	}
	f.write(path, "ALPHA=a\nBETA=2\n")
	delivered := false
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1/swap" && !delivered && held != nil {
			delivered = true
			response, err := client.DefaultFetch(held)
			must(t, err)
			response.Body.Close()
		}
		return client.DefaultFetch(req)
	}
	_, err = syncer.Push(f.ctx, f.second, opts)
	must(t, err)
	equal(t, f.serverValue(), value{"ALPHA=a\nBETA=2\n", true})
	entries, err := os.ReadDir(filepath.Join(f.second.Home, "state", "attempts"))
	must(t, err)
	equal(t, len(entries), 0)
	for _, name := range []string{"upload-attempt.json", "lineage"} {
		_, err = os.Stat(filepath.Join(f.second.Home, "state", name))
		if !os.IsNotExist(err) {
			t.Fatal(name, err)
		}
	}
}
func TestCorruptAttemptProposal(t *testing.T) {
	for _, kind := range []string{"header", "sequence"} {
		t.Run(kind, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout("copy")[0]
			f.write(filepath.Join(target.Root, ".env"), "TOKEN=edit\n")
			opts := f.opts
			opts.Fetcher = lostFetch
			if kind == "sequence" {
				opts.Fetcher = func(req *http.Request) (*http.Response, error) {
					if req.URL.Path == "/v1/swap" {
						return nil, errors.New("Request not delivered")
					}
					return client.DefaultFetch(req)
				}
			}
			_, err := syncer.Push(f.ctx, f.second, opts)
			if err == nil {
				t.Fatal("expected lost request or response")
			}
			directory := filepath.Join(f.second.Home, "state", "attempts")
			entries, err := os.ReadDir(directory)
			must(t, err)
			equal(t, len(entries), 1)
			path := filepath.Join(directory, entries[0].Name())
			var record map[string]any
			must(t, json.Unmarshal([]byte(f.read(path)), &record))
			record[kind] = "invalid"
			if kind == "sequence" {
				record[kind] = "0"
			}
			data, err := json.Marshal(record)
			must(t, err)
			f.write(path, string(data))
			if kind == "header" {
				f.pull(f.first)
				f.write(f.aStore, original)
				f.push(f.first)
			}
			equal(t, f.push(f.second).Conflicts, 1)
			equal(t, f.serverValue(), value{original, true})
		})
	}
}
