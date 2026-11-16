package model

import statefiles "github.com/notsuhas/envden/go/cli/state/files"

func (c *Context) AtomicWrite(path string, data []byte) error {
	if c.Options.AtomicWrite != nil {
		return c.Options.AtomicWrite(path, data)
	}

	return statefiles.AtomicWrite(path, data, c.Options.Now)
}
