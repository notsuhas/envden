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
		{[]string{".env", ".ENV"}, false, map[int]bool{}},
		{[]string{".env", ".ENV", "é/.env", "e\u0301/.env", "Dir/.env", "dir/.env.local"}, false, map[int]bool{3: true}},
		{[]string{".env", ".ENV", "é/.env", "e\u0301/.env", "Dir/.env", "dir/.env.local"}, true, map[int]bool{1: true, 3: true, 5: true}},
		{[]string{".env", ".ENV"}, true, map[int]bool{1: true}},
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
