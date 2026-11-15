package checkouts

import "testing"

func TestRescanCommand(t *testing.T) {
	for _, row := range []struct {
		command         string
		roots, excluded []string
		want            string
	}{{"track", nil, nil, "envden track ~"}, {"setup", nil, nil, "envden setup"}, {"setup", []string{"/home/me/Work Space"}, []string{"/outside"}, "envden setup --scan-root ~/'Work Space' --exclude-root /outside"}, {"track", []string{"/outside/a'b"}, nil, "envden track '/outside/a'\\''b'"}} {
		if got := RescanCommand(row.command, row.roots, row.excluded, "/home/me"); got != row.want {
			t.Fatal(got, row.want)
		}
	}
}
