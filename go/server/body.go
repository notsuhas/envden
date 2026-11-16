package server

import "io"

// The transport owns body cleanup so middleware cancellation cannot race its drain.
type retainedBody struct{ io.Reader }

func (retainedBody) Close() error { return nil }
