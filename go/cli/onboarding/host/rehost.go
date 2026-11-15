package host

import (
	"context"
	"encoding/binary"
	"github.com/notsuhas/envden/go/cli/contracts"
	service "github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"net/url"
	"os"
	"runtime"
	"unicode/utf16"
)

func HostedAddress(saved, exposed string) string {
	a, err := url.Parse(saved)
	if err != nil {
		return saved
	}
	b, err := url.Parse(exposed)
	if err != nil {
		return saved
	}
	if a.Hostname() == b.Hostname() {
		return exposed
	}
	return saved
}

func RehostServer(ctx context.Context, a contracts.Adapters, state *model.State) error {
	raw, err := os.ReadFile(service.ServiceFile(runtime.GOOS, a.UserHome, a.Home))
	if err == nil {
		if runtime.GOOS == "windows" || len(raw) >= 2 && raw[0] == 255 && raw[1] == 254 {
			if len(raw) >= 2 && raw[0] == 255 && raw[1] == 254 {
				raw = raw[2:]
			}
			units := []uint16{}
			for len(raw) >= 2 {
				units = append(units, binary.LittleEndian.Uint16(raw))
				raw = raw[2:]
			}
			raw = []byte(string(utf16.Decode(units)))
		}
		if port := service.InstalledPort(string(raw)); port != nil {
			_, err = a.HostServer(*port)
			return err
		}
	}
	port, err := a.ServerPort()
	if err != nil {
		return err
	}
	if _, err = a.HostServer(port); err != nil {
		return err
	}
	address, err := a.Network.Expose(port)
	if err != nil {
		return err
	}
	if state.Server == nil {
		return nil
	}
	state.Server.Address = HostedAddress(state.Server.Address, address)
	return store.SaveState(ctx, a.Home, state, a.Timing)
}
