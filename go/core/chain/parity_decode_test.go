package chain_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
)

func decode[T any](raw json.RawMessage) T {
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		panic(err)
	}
	hydrate(reflect.ValueOf(&v).Elem())

	return v
}

func hydrate(v reflect.Value) {
	if !v.IsValid() {
		return
	}
	if v.Kind() == reflect.Pointer {
		if !v.IsNil() {
			hydrate(v.Elem())
		}

		return
	}
	if v.Type() == reflect.TypeFor[codecs.Entry]() {
		entry := v.Addr().Interface().(*codecs.Entry)
		raw, _ := json.Marshal(entry.Payload)
		switch entry.Kind {
		case 0:
			entry.Payload = decode[entrypayloads.Genesis](raw)
		case 1:
			entry.Payload = decode[entrypayloads.AddDevice](raw)
		case 2:
			entry.Payload = decode[entrypayloads.RemoveDevice](raw)
		case 3:
			entry.Payload = decode[entrypayloads.NewEpoch](raw)
		case 4:
			entry.Payload = decode[entrypayloads.ReplaceRecovery](raw)
		case 5:
			entry.Payload = decode[entrypayloads.ServerMoved](raw)
		case 6:
			entry.Payload = decode[entrypayloads.RepairDone](raw)
		case 7:
			entry.Payload = decode[entrypayloads.RenameDevice](raw)
		}

		return
	}
	switch v.Kind() {
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			hydrate(v.Field(i))
		}
	case reflect.Slice:
		for i := 0; i < v.Len(); i++ {
			hydrate(v.Index(i))
		}
	}
}

func equalJSON(t *testing.T, want, got any, path string) {
	t.Helper()
	if strings.HasSuffix(path, ".noFastForward") {
		if ids, ok := got.([]any); ok {
			set := map[string]any{}
			for _, id := range ids {
				set[id.(string)] = true
			}
			got = set
		}
	}
	switch w := want.(type) {
	case map[string]any:
		g, ok := got.(map[string]any)
		if !ok && len(w) > 0 {
			t.Fatalf("%s: expected object, got %v", path, got)
		}
		for _, suffix := range []string{".devices", ".everUsedIds", ".repairIds", ".commits", ".noFastForward"} {
			if strings.HasSuffix(path, suffix) && len(w) != len(g) {
				t.Fatalf("%s: map length mismatch", path)
			}
		}
		for k, x := range w {
			var y any
			for key, v := range g {
				if equalFold(key, k) {
					y = v
					break
				}
			}
			equalJSON(t, x, y, path+"."+k)
		}
	case []any:
		g, ok := got.([]any)
		if (!ok && len(w) > 0) || len(w) != len(g) {
			t.Fatalf("%s: array length mismatch", path)
		}
		for i, x := range w {
			equalJSON(t, x, g[i], path+"[]")
		}
	default:
		if !reflect.DeepEqual(w, got) {
			t.Fatalf("%s: expected %v, got %v", path, w, got)
		}
	}
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		x, y := a[i], b[i]
		if x >= 'A' && x <= 'Z' {
			x += 32
		}
		if y >= 'A' && y <= 'Z' {
			y += 32
		}
		if x != y {
			return false
		}
	}

	return true
}
