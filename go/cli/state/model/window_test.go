package model

import (
	"encoding/json"
	"testing"
)

func TestFractionalSession(t *testing.T) {
	raw := `{"unlockedUntil":1.5,"freshUntil":2.25}`
	var w Window
	if err := json.Unmarshal([]byte(raw), &w); err != nil {
		t.Fatal(err)
	}
	got, err := json.Marshal(w)
	if err != nil || string(got) != raw {
		t.Fatal(string(got), err)
	}
}
