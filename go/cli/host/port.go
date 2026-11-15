package host

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

const DefaultServerPort = 4783

type PortProbe struct {
	Free    func(int) (bool, error)
	Envden  func(int) (bool, error)
	AnyFree func() (int, error)
}

func ChooseServerPort(probe PortProbe, preferred int) (int, error) {
	free, err := probe.Free(preferred)
	if err != nil {
		return 0, err
	}
	if free {
		return preferred, nil
	}
	ours, err := probe.Envden(preferred)
	if err != nil {
		return 0, err
	}
	if ours {
		return preferred, nil
	}
	return probe.AnyFree()
}
func InstalledPort(definition string) *int {
	m := regexp.MustCompile(`--port(?:</string><string>|"? "?|\s+)(\d{1,5})`).FindStringSubmatch(definition)
	if len(m) < 2 {
		return nil
	}
	n, _ := strconv.Atoi(m[1])
	if n < 1 || n > 65535 {
		return nil
	}
	return &n
}
func SystemPortProbe() PortProbe {
	return PortProbe{Free: func(port int) (bool, error) {
		l, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
		if err != nil {
			return false, nil
		}
		return true, l.Close()
	}, Envden: func(port int) (bool, error) {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		r, err := http.NewRequestWithContext(ctx, "GET", "http://127.0.0.1:"+strconv.Itoa(port)+"/v1/status", nil)
		if err != nil {
			return false, nil
		}
		response, err := http.DefaultClient.Do(r)
		if err != nil {
			return false, nil
		}
		defer response.Body.Close()
		var v map[string]any
		if json.NewDecoder(response.Body).Decode(&v) != nil {
			return false, nil
		}
		_, ok := v["mode"].(string)
		return ok, nil
	}, AnyFree: func() (int, error) {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return 0, err
		}
		port := l.Addr().(*net.TCPAddr).Port
		return port, l.Close()
	}}
}
