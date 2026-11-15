package client

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/versions"
)

type cancelBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *cancelBody) Close() error { defer b.cancel(); return b.ReadCloser.Close() }

func (c *Client) checkServerMinimum(ctx context.Context) error {
	o := c.options
	verified, err := Hello(ctx, o.Address, o.Pin, o.Fetcher, "")
	if err != nil {
		return err
	}

	comparison, err := versions.CompareSemver(o.Version, verified.Hello.MinClient)
	if err != nil {
		return err
	}

	if comparison < 0 {
		if o.LatestRelease != nil {
			latest, e := o.LatestRelease(ctx)
			if e == nil && latest != "" {
				cmp, e := versions.CompareSemver(verified.Hello.MinClient, latest)
				if e == nil && cmp > 0 {
					return errors.New(errors.ClientTooOld, "The server requires a version that doesn't exist")
				}
			}
		}

		return errors.New(errors.ClientTooOld, "Update envden to meet the signed server minimum")
	}

	return errors.New(errors.InvalidData, "Server rejected a supported client")
}
