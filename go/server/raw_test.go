package server

import (
	"bufio"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
)

type responseMetadata struct {
	Status     string
	StatusCode int
	Header     http.Header
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
