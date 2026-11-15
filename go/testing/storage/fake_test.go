package storage

import "testing"

func TestFakeStrictnessAndBinding(t *testing.T) {
	fake := CreateFakeStorageAdapter(Operations{SetSetupToken: func(b []byte) error {
		if len(b) != 1 || b[0] != 9 {
			t.Fatal(b)
		}
		return nil
	}})
	if fake.ID() != "fake-storage" {
		t.Fatal(fake.ID())
	}
	if err := fake.SetSetupToken([]byte{9}); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if got := recover(); got != "Unexpected fake operation: storage.head" {
			t.Fatal(got)
		}
	}()
	fake.Head([]byte{1})
}
