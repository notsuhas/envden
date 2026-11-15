//go:build !darwin && !linux

package raw

import "golang.org/x/term"

func Make(fd int) (*term.State, error) { return term.MakeRaw(fd) }
