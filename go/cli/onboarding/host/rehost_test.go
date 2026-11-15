package host

import (
	"context"
	"encoding/binary"
	"github.com/notsuhas/envden/go/cli/contracts"
	service "github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"unicode/utf16"
)

func TestRehostKeepsInstalledPort(t *testing.T) {
	root := t.TempDir()
	definition, err := service.ServiceDefinition(runtime.GOOS, "/bin/envden", "/data", "/log", 4783)
	if err != nil {
		t.Fatal(err)
	}
	path := service.ServiceFile(runtime.GOOS, root, root)
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	raw := []byte(definition.Content)
	if runtime.GOOS == "windows" {
		raw = nil
		for _, unit := range utf16.Encode([]rune(definition.Content)) {
			raw = binary.LittleEndian.AppendUint16(raw, unit)
		}
	}
	if err = os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	ports := []int{}
	a := contracts.Adapters{Home: root, UserHome: root, Timing: lock.Timing{Now: func() int64 { return 1800000000000 }}, HostServer: func(port int) (service.Installed, error) {
		ports = append(ports, port)
		return service.Installed{}, nil
	}, ServerPort: func() (int, error) { t.Fatal("must retain installed port"); return 0, nil }}
	state := model.EmptyState("laptop")
	state.Server = &model.Server{Address: "https://laptop.tail.ts.net:4783"}
	if err = RehostServer(context.Background(), a, state); err != nil {
		t.Fatal(err)
	}
	if len(ports) != 1 || ports[0] != 4783 {
		t.Fatal(ports)
	}
}

func TestHostedAddress(t *testing.T) {
	for _, row := range []struct{ saved, exposed, want string }{{"https://a.ts.net:4783", "https://a.ts.net:51234", "https://a.ts.net:51234"}, {"https://a.ts.net:4783", "https://b.ts.net:51234", "https://a.ts.net:4783"}} {
		if got := HostedAddress(row.saved, row.exposed); got != row.want {
			t.Fatal(got)
		}
	}
}
