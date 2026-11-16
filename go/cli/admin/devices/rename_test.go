package devices

import (
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
)

func TestRenameCheck(t *testing.T) {
	own := []byte{1}
	ds := []members.DeviceRecord{{Id: own, Name: "laptop"}, {Id: []byte{2}, Name: "desktop"}}
	for _, c := range []struct{ name, want string }{{"work", "rename"}, {"laptop", "unchanged"}, {"desktop", "taken"}, {"", "invalid"}, {strings.Repeat("a", 65), "invalid"}, {"work\u200b", "invalid"}, {"work\nhome", "invalid"}, {"work\t", "invalid"}, {"\x1b[31mwork", "invalid"}, {"work\x7f", "invalid"}, {"work\u0085", "invalid"}} {
		t.Run(c.name, func(t *testing.T) {
			if got := RenameCheck(ds, own, c.name); got != c.want {
				t.Fatalf("got %s, want %s", got, c.want)
			}
		})
	}
}
