package clack

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestStaticReference(t *testing.T) {
	var out bytes.Buffer
	terminal := New(strings.NewReader(""), &out)
	terminal.Color = false
	terminal.ASCII = false
	terminal.Intro("Welcome")
	for _, kind := range []string{"message", "info", "success", "step", "warn", "error"} {
		terminal.Log(kind, "First\nSecond\n")
	}
	terminal.Note("Keep this safe\nTwo lines", "Recovery")
	terminal.Outro("Done")
	terminal.Cancel("Cancelled")
	data, err := os.ReadFile("testdata/static.json")
	if err != nil {
		t.Fatal(err)
	}
	var want string
	if err = json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}
	if out.String() != want {
		t.Errorf("got %q want %q", out.String(), want)
	}
}

func TestSpinnerReference(t *testing.T) {
	var out bytes.Buffer
	terminal := New(strings.NewReader(""), &out)
	terminal.Color = false
	terminal.ASCII = false
	s := terminal.Spinner()
	s.Manual = true
	s.Start("Working...")
	for range 10 {
		s.Tick()
	}
	s.Message("Next")
	s.Tick()
	s.Stop("Done")
	data, err := os.ReadFile("testdata/spinner.json")
	if err != nil {
		t.Fatal(err)
	}
	var want string
	if err = json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}
	if out.String() != want {
		t.Errorf("got %q want %q", out.String(), want)
	}
}
