package server

import (
	"bufio"
	"bytes"
	"io"
	"net"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func compareBunStalledBodies(t *testing.T, tsAddress, goAddress string) {
	t.Helper()

	t.Run("withheld bodies", func(t *testing.T) {
		for _, request := range []string{
			"POST /missing HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\n",
			"POST /v1/vault HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\n",
			"GET /v1/status HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\n",
			"HEAD /v1/status HTTP/1.1\r\nHost: server\r\nContent-Length: 1\r\n\r\n",
		} {
			t.Run(strings.Split(request, " HTTP")[0], func(t *testing.T) {
				t.Parallel()
				var responses [2]responseMetadata
				var bodies [2][]byte
				var wg sync.WaitGroup
				for i, address := range []string{tsAddress, goAddress} {
					wg.Go(func() { responses[i], bodies[i] = stalledResponse(t, address, request) })
				}
				wg.Wait()
				responses[0].Header.Del("Date")
				responses[1].Header.Del("Date")
				if !reflect.DeepEqual(responses[0], responses[1]) || !bytes.Equal(bodies[0], bodies[1]) {
					t.Errorf("responses: %+v bodies: %q", responses, bodies)
				}
			})
		}
	})

}

func stalledResponse(t *testing.T, address, request string) (responseMetadata, []byte) {
	t.Helper()
	conn, err := net.Dial("tcp", address)
	if err != nil {
		t.Error(err)
		return responseMetadata{}, nil
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err = io.WriteString(conn, request); err != nil {
		t.Error(err)
		return responseMetadata{}, nil
	}
	reader := bufio.NewReader(conn)
	response, err := http.ReadResponse(reader, &http.Request{Method: strings.Split(request, " ")[0]})
	if err != nil {
		t.Error(err)
		return responseMetadata{}, nil
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Error(err)
	}
	_ = response.Body.Close()
	_ = conn.SetReadDeadline(time.Now().Add(14 * time.Second))
	if extra, err := io.ReadAll(reader); err != nil || len(extra) > 0 {
		t.Errorf("%s close: %q %v", address, extra, err)
	}
	return responseMetadata{Status: response.Status, StatusCode: response.StatusCode, Header: response.Header}, body
}
