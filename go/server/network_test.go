package server

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/adapters/storage/sqlite"
	"github.com/notsuhas/envden/go/server/shared"
)

func TestBunNetworkParity(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}
	bun, err := exec.LookPath("bun")
	if err != nil {
		t.Fatal(err)
	}
	var fixture parityFixture
	if err = json.Unmarshal(loadReferences(t)[0].Fixture, &fixture); err != nil {
		t.Fatal(err)
	}
	tsDir, goDir := t.TempDir(), t.TempDir()
	storage, err := sqlite.CreateSqliteStorageAdapter(goDir, fixture.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = storage.Close() }()
	app, err := CreateApp(Options{Storage: storage, Now: func() int64 { return fixture.Now }, ServerKeys: ServerKeys{SecretKey: fixture.Keys.SecretKey, PublicKey: fixture.Keys.PublicKey, OpaqueSetup: fixture.Keys.OpaqueSetup}, Config: fixture.Config})
	if err != nil {
		t.Fatal(err)
	}
	goServer := httptest.NewUnstartedServer(app)
	goServer.Listener = compatibleListener{goServer.Listener}
	goServer.Config.ConnContext = connectionContext
	goServer.Start()
	defer goServer.Close()
	config := struct {
		Dir    string `json:"dir"`
		Now    int64  `json:"now"`
		Keys   any    `json:"keys"`
		Config any    `json:"config"`
	}{tsDir, fixture.Now, map[string]any{"secretKey": fixture.Keys.SecretKey, "publicKey": fixture.Keys.PublicKey, "opaqueSetup": fixture.Keys.OpaqueSetup}, map[string]string{"appVersion": fixture.Config.AppVersion, "minClient": fixture.Config.MinClient}}
	configPath := filepath.Join(t.TempDir(), "config.json")
	configBytes, err := shared.JSON(config)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(configPath, configBytes, 0600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(bun, "--eval", `import { createApp } from "../../apps/server/src/app.ts";
import { createAdapters } from "../../apps/server/src/adapters.ts";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(process.argv[1], "utf8"));
const { storage } = createAdapters(config.dir, config.now);

const app = createApp({
  storage,
  now: () => config.now,
  serverKeys: {
    secretKey: Buffer.from(config.keys.secretKey, "base64"),
    publicKey: Buffer.from(config.keys.publicKey, "base64"),
    opaqueSetup: config.keys.opaqueSetup,
  },
  config: config.config,
});

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  maxRequestBodySize: 33554432,
  fetch: app.fetch,
});

console.log(server.port);

process.on("SIGTERM", () => {
  server.stop(true);
  storage.close();
  process.exit(0);
});
`, configPath)
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Signal(os.Interrupt); _ = cmd.Wait() }()
	line, err := bufio.NewReader(out).ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	tsAddress := "127.0.0.1:" + strings.TrimSpace(line)
	goAddress := strings.TrimPrefix(goServer.URL, "http://")
	compareBunStalledBodies(t, tsAddress, goAddress)

	cases := []string{
		"HEAD / HTTP/1.1\r\nHost: server\r\n\r\n",
		"HEAD /v1/head HTTP/1.1\r\nHost: server\r\n\r\n",
		"POST /v1/swap HTTP/1.1\r\nHost: server\r\nContent-Length: 33554433\r\nEnvden-Request: !\r\n\r\n",
		"POST /v1/vault HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\nx",
		"GET /v1/../v1/status HTTP/1.1\r\nHost: server\r\n\r\n",
		"GET / HTTP/1.1\r\nHost: server\r\n\r\n",
		"GET /v1/status HTTP/1.1\r\nHost: server\r\n\r\n",
		"GET /missing HTTP/1.1\r\nHost: server\r\n\r\n",
		"POST /missing HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\nx",
		"POST /v1/status HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\nx",
		"GET /v1/status HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\nx",
		"GET /v1/hello?challenge=" + strings.Repeat("A", 43) + " HTTP/1.1\r\nHost: server\r\n\r\n",
		"HEAD /v1/hello?challenge=" + strings.Repeat("A", 43) + " HTTP/1.1\r\nHost: server\r\n\r\n",
		"GET /v1/head HTTP/1.1\r\nHost: server\r\n\r\n",
		"GET /v1/not-a-route HTTP/1.1\r\nHost: server\r\n\r\n",
		"PUT /v1/vault HTTP/1.1\r\nHost: server\r\nEnvden-Request: !\r\nContent-Length: 1\r\n\r\nx",
		"POST /v1/vault HTTP/1.1\r\nHost: server\r\nEnvden-Request: !\r\nContent-Length: 1\r\n\r\nx",
		"OPTIONS /v1/status HTTP/1.1\r\nHost: server\r\n\r\n",
		"POST /v1/vault HTTP/1.1\r\nHost: server\r\nContent-Length: abc\r\n\r\n",
		"POST /v1/vault HTTP/1.1\r\nHost: server\r\nContent-Length: -1\r\n\r\n",
		"POST /v1/vault HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\nxx",
	}
	for i, request := range cases {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			expected, expectedBody := rawResponse(t, tsAddress, request)
			got, gotBody := rawResponse(t, goAddress, request)
			if got.Status != expected.Status || !bytes.Equal(gotBody, expectedBody) {
				t.Errorf("%s\nstatus %s want %s\nbody %.200s want %.200s", strings.Split(request, "\r\n")[0], got.Status, expected.Status, gotBody, expectedBody)
			}
			expected.Header.Del("Date")
			got.Header.Del("Date")
			if !reflect.DeepEqual(got.Header, expected.Header) {
				t.Errorf("headers got %v want %v", got.Header, expected.Header)
			}
		})
	}
}

func rawResponse(t *testing.T, address, request string) (responseMetadata, []byte) {
	t.Helper()
	conn, err := net.Dial("tcp", address)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	if _, err = io.WriteString(conn, request); err != nil {
		t.Fatal(err)
	}
	method := strings.Split(request, " ")[0]
	response, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: method})
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()

	return responseMetadata{StatusCode: response.StatusCode, Header: response.Header, Status: response.Status}, data
}

type responseMetadata struct {
	Status     string
	StatusCode int
	Header     http.Header
}
