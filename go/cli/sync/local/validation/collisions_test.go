package validation

import (
	"reflect"
	"testing"
)

func TestPathCollisions(t *testing.T) {
	for _, tc := range []struct {
		paths       []string
		insensitive bool
		want        map[int]bool
	}{
		{[]string{"ΟΣ/.env", "ος/.env.local"}, true, map[int]bool{1: true}},
		{[]string{"İ.env", "i.env"}, true, map[int]bool{}},
		{[]string{"İ/.env", "i\u0307/.env.local"}, true, map[int]bool{0: true}},
		{[]string{".env", ".ENV"}, false, map[int]bool{}},
		{[]string{".env", ".ENV", "é/.env", "e\u0301/.env", "Dir/.env", "dir/.env.local"}, false, map[int]bool{2: true}},
		{[]string{".env", ".ENV", "é/.env", "e\u0301/.env", "Dir/.env", "dir/.env.local"}, true, map[int]bool{0: true, 2: true, 5: true}},
		{[]string{".env", ".ENV"}, true, map[int]bool{0: true}},
		{[]string{"Config/.env", "config/.env.local"}, true, map[int]bool{1: true}},
		{[]string{"cafe\u0301/.env", "café/.env.local"}, false, map[int]bool{1: true}},
		{[]string{"a/.env", "a/.env.local"}, true, map[int]bool{}},
	} {
		if got := PathCollisions(tc.paths, tc.insensitive); !reflect.DeepEqual(got, tc.want) {
			t.Fatal(tc, got)
		}
	}
}

func TestFileSizeNotice(t *testing.T) {
	if FileSizeNotice(".env", make([]byte, 1048576)) != "" || FileSizeNotice(".env", make([]byte, 1048577)) != "Skipped oversized env file: .env exceeds 1 MiB" {
		t.Fatal("size boundary")
	}
}

func TestCollisionEntryOrder(t *testing.T) {
	for _, paths := range [][]string{{"Dir/.env", "dir/.env.local"}, {"dir/.env.local", "Dir/.env"}} {
		got := []string{}
		for index := range PathCollisions(paths, true) {
			got = append(got, paths[index])
		}
		if !reflect.DeepEqual(got, []string{"dir/.env.local"}) {
			t.Fatalf("paths %v: got %v", paths, got)
		}
		if len(PathCollisions(paths, false)) != 0 {
			t.Fatal("case sensitive paths collided")
		}
	}
}
