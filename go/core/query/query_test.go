package query

import "testing"

func TestURLSearchParams(t *testing.T) {
	values := Values("file=a;b&file=c&from=%ZZ&space=+7&hex=0x7")
	for k, want := range map[string]string{"file": "a;b", "from": "%ZZ", "space": " 7", "hex": "0x7"} {
		if got := values.Get(k); got != want {
			t.Fatal(k, got)
		}
	}
}
