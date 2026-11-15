package keychain

import (
	"bytes"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func KeychainContract(t *testing.T, factory func(string) adapters.Keychain) {
	t.Helper()
	t.Run("missing and repeated deletion", func(t *testing.T) {
		a := factory(t.TempDir())
		v, e := a.Get("missing", false)
		if e != nil || v != nil {
			t.Fatalf("missing: %v %v", v, e)
		}
		for range 2 {
			if e = a.Delete("missing"); e != nil {
				t.Fatal(e)
			}
		}
		v, e = a.Get("missing", false)
		if e != nil || v != nil {
			t.Fatal(v, e)
		}
	})
	t.Run("binary replacement empty and isolation", func(t *testing.T) {
		a := factory(t.TempDir())
		b := []byte{0, 255, 128, 10}
		if e := a.Set("../key", b); e != nil {
			t.Fatal(e)
		}
		for i := range b {
			b[i] = 1
		}
		if e := a.Set("other", []byte{}); e != nil {
			t.Fatal(e)
		}
		check := func(name string, want []byte) {
			t.Helper()
			v, e := a.Get(name, false)
			if e != nil || !bytes.Equal(v, want) || (want != nil && v == nil) {
				t.Fatalf("%s: %v %v", name, v, e)
			}
		}
		check("../key", []byte{0, 255, 128, 10})
		check("other", []byte{})
		only, e := a.OwnerOnly()
		if e != nil || !only {
			t.Fatal(only, e)
		}
		if e = a.Set("../key", []byte{42}); e != nil {
			t.Fatal(e)
		}
		check("../key", []byte{42})
		if e = a.Delete("../key"); e != nil {
			t.Fatal(e)
		}
		check("../key", nil)
		check("other", []byte{})
	})
}
