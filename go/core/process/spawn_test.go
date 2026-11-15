package process

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

func TestRunningRuntimeTrusted(t *testing.T) {
	self, _ := os.Executable()
	for _, name := range []string{"bun", self} {
		got, err := ResolveTrustedExecutable(name)
		if err != nil || got != self {
			t.Fatal(got, err)
		}
	}
}

func TestSpawnEnvironmentAndResults(t *testing.T) {
	if platformName() == "win32" {
		return
	}
	t.Setenv("NODE_PATH", "payload")
	out, err := ExecTrusted("sh", []string{"-c", `test -z "$NODE_PATH" && printf runtime; printf error >&2`}, Options{})
	if err != nil || out.Stdout != "runtime" || out.Stderr != "error" {
		t.Fatal(out, err)
	}
	text, err := ExecTrustedSync("sh", []string{"-c", `test -z "$NODE_PATH" && printf sync`}, Options{})
	if err != nil || text != "sync" {
		t.Fatal(text, err)
	}
	out, err = ExecTrusted("sh", []string{"-c", "exit 7"}, Options{})
	typed, ok := enverrors.As(err)
	if !ok || typed.Message != "Subprocess failed" || out.ExitCode != 7 || func() *ExitError {
		target := &ExitError{}
		_ = errors.As(typed.Cause, &target)

		return target
	}().ExitCode != 7 {
		t.Fatal(out, err)
	}
	_, err = ExecTrustedSync("sh", []string{"-c", "exit 7"}, Options{})
	typed, ok = enverrors.As(err)
	if !ok || typed.Cause != nil {
		t.Fatal(err)
	}
	root := canonicalTemp(t)
	out, err = ExecTrusted("sh", []string{"-c", `cat; printf "$EXPLICIT"; pwd`}, Options{Cwd: root, Env: map[string]string{"EXPLICIT": "yes"}, Input: []byte("input")})
	if err != nil || out.Stdout != "inputyes"+root+"\n" {
		t.Fatal(out, err)
	}
}

func TestShebangUsesSystemBeforeManager(t *testing.T) {
	if platformName() == "win32" {
		return
	}
	root := canonicalTemp(t)
	checkout := filepath.Join(root, "checkout")
	manager := filepath.Join(root, "manager")
	mkdir(t, checkout)
	mkdir(t, manager)
	writeTool(t, filepath.Join(checkout, "sh"), "#!/bin/sh\nprintf compromised")
	if err := os.Symlink(filepath.Join(checkout, "sh"), filepath.Join(manager, "sh")); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(root, "script")
	writeTool(t, script, "#!/usr/bin/env sh\nprintf system")
	SetUntrustedRoots([]string{checkout})
	defer SetUntrustedRoots(nil)
	out, err := ExecTrusted(script, nil, Options{ManagerBin: manager})
	if err != nil || out.Stdout != "system" {
		t.Fatal(out, err)
	}
}

func TestUTF8Output(t *testing.T) {
	raw := []byte{239, 187, 191, 255, 255, 226, 130}
	if got := decodeOutput(raw, true); got != "\ufffd\ufffd\ufffd" {
		t.Fatalf("%q", got)
	}
	if got := decodeOutput(raw, false); got != "\ufeff\ufffd\ufffd\ufffd" {
		t.Fatalf("%q", got)
	}
}

func TestSyncSpawnRawBytes(t *testing.T) {
	if platformName() == "win32" {
		return
	}
	out, err := SpawnTrustedSync("sh", []string{"-c", `printf '\377\376'; exit 3`}, Options{})
	if err != nil || string(out.Stdout) != string([]byte{255, 254}) || out.ExitCode != 3 {
		t.Fatal(out, err)
	}
}
