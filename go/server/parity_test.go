package server

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/adapters/storage/sqlite"
	"github.com/notsuhas/envden/go/server/middleware"
	"github.com/notsuhas/envden/go/server/status"
)

type parityFixture struct {
	Budgets []struct {
		Bytes         int64
		Kind          string
		Vault, Device []byte
	}
	Faults      map[string]any
	StatusCalls int
	Now         int64
	Keys        struct {
		SecretKey, PublicKey []byte
		OpaqueSetup          string
	}
	Config Config
	Status *struct {
		Enabled   bool
		StartedAt int64
		LastPrune *struct {
			At int64
			OK bool
		}
	}
	Files   map[string][]byte
	Request struct {
		URL, Method string
		Headers     map[string]string
		Body        []byte
	}
	Response struct {
		Status  int
		Headers map[string]string
		Body    []byte
	}
	Tables map[string][]map[string]any
}

type capturedReference struct {
	Name     string
	Fixture  json.RawMessage
	Database []byte
}

func loadReferences(t *testing.T) []capturedReference {
	t.Helper()
	file, err := os.Open("testdata/reference.json.gz")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	reader, err := gzip.NewReader(file)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	var references []capturedReference
	if err = json.NewDecoder(reader).Decode(&references); err != nil {
		t.Fatal(err)
	}
	if len(references) == 0 {
		t.Fatal("missing reference requests")
	}

	return references
}

func TestTypeScriptParity(t *testing.T) {
	for _, reference := range loadReferences(t) {
		t.Run(reference.Name, func(t *testing.T) { replayFixture(t, reference) })
	}
}

func replayFixture(t *testing.T, reference capturedReference) {
	raw := reference.Fixture
	var err error
	var f parityFixture
	if err = json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	reader, err := gzip.NewReader(bytes.NewReader(reference.Database))
	if err != nil {
		t.Fatal(err)
	}
	dbBytes, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	_ = reader.Close()
	if err = os.WriteFile(filepath.Join(dir, "envden.sqlite"), dbBytes, 0600); err != nil {
		t.Fatal(err)
	}
	for name, data := range f.Files {
		dest := filepath.Join(dir, name)
		if err = os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(dest, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	storage, err := sqlite.CreateSqliteStorageAdapter(dir, f.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = storage.Close() }()
	var adapter = storage
	if len(f.Faults) > 0 {
		adapter = parityFaultStorage{Storage: storage, faults: f.Faults}
	}
	o := Options{Storage: adapter, Now: func() int64 { return f.Now }, ServerKeys: ServerKeys{SecretKey: f.Keys.SecretKey, PublicKey: f.Keys.PublicKey, OpaqueSetup: f.Keys.OpaqueSetup}, Config: f.Config, Stderr: io.Discard}
	budget := middleware.NewBodyBudget()
	for _, reservation := range f.Budgets {
		release, err := budget.Reserve(reservation.Bytes, reservation.Kind, reservation.Vault, reservation.Device)
		if err != nil {
			t.Fatal(err)
		}
		defer release()
	}
	o.ReserveBody = budget.Reserve
	state := status.New(f.Now, nil)
	if f.Status != nil {
		state.Enabled = f.Status.Enabled
		state.StartedAt = f.Status.StartedAt
		if f.Status.LastPrune != nil {
			state.LastPrune = &status.Prune{At: f.Status.LastPrune.At, OK: f.Status.LastPrune.OK}
		}
	}
	if f.StatusCalls > 1 {
		for i := 1; i < f.StatusCalls; i++ {
			state.Admit(f.Now)
		}
	}
	app, err := CreateApp(o, state)
	if err != nil {
		t.Fatal(err)
	}
	var body io.Reader
	if len(f.Request.Body) > 0 {
		body = bytes.NewReader(f.Request.Body)
	}
	req := httptest.NewRequest(f.Request.Method, f.Request.URL, body)
	for key, value := range f.Request.Headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	app.ServeHTTP(recorder, req)
	response := recorder.Result()
	defer func() { _ = response.Body.Close() }()
	actual, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != f.Response.Status {
		t.Fatalf("%s %s: status %d want %d; body %.160s", req.Method, req.URL.Path, response.StatusCode, f.Response.Status, actual)
	}
	nondeterministic := strings.HasSuffix(req.URL.Path, "/start") && response.StatusCode == 200
	if nondeterministic {
		var expected, got struct{ Message string }
		if json.Unmarshal(actual, &got) != nil || json.Unmarshal(f.Response.Body, &expected) != nil || len(got.Message) != len(expected.Message) {
			t.Fatalf("OPAQUE response shape differs")
		}
	} else if req.URL.Path == "/" && response.StatusCode == 200 {
		if !reflect.DeepEqual(statusPageFacts(actual), statusPageFacts(f.Response.Body)) {
			t.Fatalf("status page facts differ\ngot %v\nwant %v", statusPageFacts(actual), statusPageFacts(f.Response.Body))
		}
	} else if !bytes.Equal(actual, f.Response.Body) {
		t.Fatalf("%s %s: body differs\ngot %.500s\nwant %.500s", req.Method, req.URL.Path, actual, f.Response.Body)
	}
	for key, value := range f.Response.Headers {
		if strings.EqualFold(key, "date") {
			continue
		}
		if got := response.Header.Get(key); got != value {
			t.Errorf("header %s = %q want %q", key, got, value)
		}
	}
	got := readTables(t, filepath.Join(dir, "envden.sqlite"))
	if !reflect.DeepEqual(normalizeTables(got), normalizeTables(f.Tables)) {
		a, _ := json.Marshal(normalizeTables(got))
		b, _ := json.Marshal(normalizeTables(f.Tables))
		t.Errorf("%s %s database differs\ngot %.700s\nwant %.700s", req.Method, req.URL.Path, a, b)
	}
}
