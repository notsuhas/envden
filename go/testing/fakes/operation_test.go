package fakes

import "testing"

func TestUnexpected(t *testing.T) {
	defer func() {
		if got := recover(); got != "Unexpected fake operation: storage.head" {
			t.Fatalf("got %v", got)
		}
	}()
	Unexpected("storage.head")
}
