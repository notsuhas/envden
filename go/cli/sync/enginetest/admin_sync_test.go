package enginetest

import (
	"bytes"
	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/admin/recovery"
	adminshared "github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/notice"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"sort"
	"strings"
	"testing"
)

func TestUnreadableMemberFileNameDoesNotBlockPullOrRemoval(t *testing.T) {
	f := createConfiguredFixture(t, fixtureOptions{devices: 2, bare: true, password: "old password"})
	c, err := adminshared.AdminContext(f.ctx, f.second, clock, nil)
	must(t, err)
	h, err := adminshared.CurrentHistory(f.ctx, c)
	must(t, err)
	prev := h.Headers[len(h.Headers)-1]
	list := m.Files{Entries: []m.FileEntry{{FileId: bytes.Repeat([]byte{9}, 32), Version: 1, Epoch: h.State.Epoch, State: 2, BlobHash: make([]byte, 32), Name: []byte{1}}}}
	body := prev.Body
	body.Seq++
	body.Prev, err = cr.ObjectHash(m.ManifestHeaderCodec, prev, "manifest")
	must(t, err)
	body.Op = 1
	body.FilesHash = cr.H("files", m.FilesCodec.Write(list))
	body.Signer = c.Identity.Record.Id
	header, err := cr.SignObject(m.ManifestHeaderCodec, body, c.Identity.Keys.ObjSk, "manifest")
	must(t, err)
	response, err := c.Client.Request(f.ctx, "/v1/swap", "POST", m.SwapCodec.Write(m.Swap{ExpectedHead: body.Prev, Header: header, Files: &list}))
	must(t, err)
	response.Body.Close()
	f.pull(f.first)
	removed, err := devices.RemoveDevice(f.ctx, f.first, "second", devices.RemoveOptions{Password: func() (string, error) { return "old password", nil }, NewKit: true, Now: clock, OnKit: func(recovery.ReplacementKit) error { return nil }})
	must(t, err)
	equal(t, removed.Exposure.Incomplete, true)
	first, err := adminshared.AdminContext(f.ctx, f.first, clock, nil)
	must(t, err)
	after, err := adminshared.CurrentHistory(f.ctx, first)
	must(t, err)
	_, exists := after.State.Devices[b.Base32(c.Identity.Record.Id)]
	equal(t, exists, false)
}
func TestDeviceRenamePropagatesThroughSync(t *testing.T) {
	f := createConfiguredFixture(t, fixtureOptions{devices: 2, bare: true, password: "old password"})
	for _, name := range []string{"first", ""} {
		_, err := devices.RenameDevice(f.ctx, f.second, name, clock, nil)
		if !e.Is(err, e.InvalidInput) {
			t.Fatal(err)
		}
	}
	kind, err := devices.RenameDevice(f.ctx, f.second, "second", clock, nil)
	must(t, err)
	equal(t, kind, "unchanged")
	kind, err = devices.RenameDevice(f.ctx, f.second, "laptop", clock, nil)
	must(t, err)
	equal(t, kind, "renamed")
	stored, err := f.second.Keychain.Get("envden/"+f.second.Home+"/device", false)
	must(t, err)
	id, err := identity.ReadIdentity(stored)
	must(t, err)
	equal(t, id.Record.Name, "laptop")
	equal(t, f.state(f.second).DeviceName, "laptop")
	f.pull(f.first)
	for _, a := range []contracts.Adapters{f.first, f.second} {
		listed, err := devices.ListDevices(f.ctx, a, clock, nil)
		must(t, err)
		names := []string{}
		for _, device := range listed {
			names = append(names, device.Name)
		}
		sort.Strings(names)
		equal(t, strings.Join(names, ","), "first,laptop")
	}
	first := f.state(f.first)
	equal(t, first.DeviceName, "first")
	var output bytes.Buffer
	must(t, notice.ReportRecoveryJoins(f.first.Home, first, nil, clock, &output))
	if !strings.Contains(output.String(), "laptop joined") || strings.Contains(output.String(), "second joined") {
		t.Fatal(output.String())
	}
}
