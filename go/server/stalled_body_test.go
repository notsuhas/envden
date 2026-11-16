package server

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/notsuhas/envden/go/adapters/storage/sqlite"
)

func TestAuthenticatedStalledBody(t *testing.T) {
	reference := loadReferences(t)[8]
	var f parityFixture
	if err := json.Unmarshal(reference.Fixture, &f); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	reader, err := gzip.NewReader(bytes.NewReader(reference.Database))
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	_ = reader.Close()
	if err = os.WriteFile(filepath.Join(dir, "envden.sqlite"), data, 0600); err != nil {
		t.Fatal(err)
	}
	storage, err := sqlite.CreateSqliteStorageAdapter(dir, f.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = storage.Close() }()
	app, err := CreateApp(Options{Storage: storage, Now: func() int64 { return f.Now }, ServerKeys: ServerKeys{SecretKey: f.Keys.SecretKey, PublicKey: f.Keys.PublicKey, OpaqueSetup: f.Keys.OpaqueSetup}, Config: f.Config})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(app)
	server.Listener = compatibleListener{server.Listener}
	server.Config.ConnContext = connectionContext
	server.Start()
	defer server.Close()
	u, err := url.Parse(f.Request.URL)
	if err != nil {
		t.Fatal(err)
	}
	var request strings.Builder
	fmt.Fprintf(&request, "%s %s HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\n", f.Request.Method, u.RequestURI())
	for k, v := range f.Request.Headers {
		fmt.Fprintf(&request, "%s: %s\r\n", k, v)
	}
	request.WriteString("\r\n")
	conn, err := net.Dial("tcp", strings.TrimPrefix(server.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetReadDeadline(time.Now().Add(24 * time.Second))
	start := time.Now()
	if _, err = io.WriteString(conn, request.String()); err != nil {
		t.Fatal(err)
	}
	buffered := bufio.NewReader(conn)
	response, err := http.ReadResponse(buffered, &http.Request{Method: f.Request.Method})
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != 400 || string(body) != `{"error":"INVALID_INPUT"}` {
		t.Fatalf("%d %s", response.StatusCode, body)
	}
	if elapsed := time.Since(start); elapsed < 10*time.Second || elapsed > 12*time.Second {
		t.Fatalf("body deadline: %v", elapsed)
	}
	if extra, err := io.ReadAll(buffered); err != nil || len(extra) > 0 {
		t.Fatalf("close: %q %v", extra, err)
	}
	if elapsed := time.Since(start); elapsed < 19*time.Second || elapsed > 22*time.Second {
		t.Fatalf("close deadline: %v", elapsed)
	}
}
