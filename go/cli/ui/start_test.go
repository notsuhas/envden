package ui

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestDashboardRefusesUnattendedAndBadPorts(t *testing.T) {
	for _, port := range []int{-1, 0, 65536} {
		_, err := RunDashboard(context.Background(), DashboardOptions{Interactive: true, Port: &port})
		if !errors.Is(err, errors.InvalidInput) {
			t.Fatal(port, err)
		}
	}

	_, err := RunDashboard(context.Background(), DashboardOptions{})
	if !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}
}

func TestDashboardServesBeforeReportingAndStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	lines := []string{}
	result, err := RunDashboard(ctx, DashboardOptions{Interactive: true, Report: func(line string) { lines = append(lines, line) }, Open: func(url string) bool {
		base, token, ok := strings.Cut(url, "#")
		if !ok {
			t.Fatal(url)
		}

		decoded, err := base64.RawURLEncoding.DecodeString(token)
		if err != nil || len(decoded) != 32 {
			t.Fatal("token", err)
		}

		response, err := http.Get(base) //nolint:gosec // The URL points at the test loopback dashboard.
		if err != nil {
			t.Fatal(err)
		}

		defer func() {
			if err := response.Body.Close(); err != nil {
				t.Error(err)
			}
		}()
		body, err := io.ReadAll(response.Body)
		if err != nil || response.StatusCode != 200 || !strings.Contains(string(body), "envden ui") {
			t.Fatal(response.StatusCode, err)
		}

		cancel()

		return false
	}})
	if err != nil || result.Kind != "stopped" {
		t.Fatal(result, err)
	}

	if len(lines) != 3 || lines[1] != "Press Ctrl-C to stop." || lines[2] != "Could not open a browser; open the link above." {
		t.Fatal(lines)
	}
}

func TestDashboardStopsAtURLLine(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	base := ""
	result, err := RunDashboard(ctx, DashboardOptions{Interactive: true, Report: func(line string) {
		if strings.HasPrefix(line, "envden ui: ") {
			base, _, _ = strings.Cut(strings.TrimPrefix(line, "envden ui: "), "#")
			cancel()
		}
	}})
	if err != nil || result.Kind != "stopped" || base == "" {
		t.Fatal(result, err, base)
	}

	response, err := http.Get(base) //nolint:gosec // The URL points at the test loopback dashboard.
	if err == nil {
		_ = response.Body.Close()
		t.Fatal("dashboard still listening")
	}
}
