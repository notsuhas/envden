package client

import (
	"bytes"
	"context"
	"crypto/rand"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/release"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type Options struct {
	HelloCache    *HelloCache
	Address       string
	Pin, VaultID  []byte
	Identity      identity.Identity
	Version       string
	Now           func() int64
	Fetcher       Fetch
	Proof         func(p.Request) ([]byte, error)
	Unlock        func(context.Context) error
	Backoff       func(int64) error
	Authenticated func() error
	LatestRelease func(context.Context) (string, error)
}

type Client struct{ options Options }

func CreateClient(options Options) *Client {
	if options.HelloCache == nil {
		options.HelloCache = NewHelloCache()
	}
	if options.Fetcher == nil {
		options.Fetcher = DefaultFetch
	}
	if options.LatestRelease == nil {
		options.LatestRelease = func(ctx context.Context) (string, error) { return release.Latest(ctx, options.Fetcher) }
	}
	if options.Backoff == nil {
		options.Backoff = func(ms int64) error {
			timer := time.NewTimer(time.Duration(ms) * time.Millisecond)
			defer timer.Stop()
			<-timer.C
			return nil
		}
	}
	return &Client{options: options}
}
func (c *Client) ForVault(vaultID []byte) *Client {
	o := c.options
	o.VaultID = vaultID
	return CreateClient(o)
}
func (c *Client) Request(ctx context.Context, path, method string, body any) (*http.Response, error) {
	return RetryBusy(func() (*http.Response, error) { return c.signedRequest(ctx, path, method, body, true) }, c.options.Backoff)
}
func (c *Client) signedRequest(ctx context.Context, path, method string, body any, retry bool) (*http.Response, error) {
	o := c.options
	serialized := []byte{}
	var err error
	if body != nil {
		if raw, ok := body.([]byte); ok {
			serialized = raw
		} else {
			serialized, err = jsonvalue.Marshal(body)
			if err != nil {
				return nil, err
			}
		}
	}
	if method == "" {
		method = "GET"
	}
	base, err := url.Parse(o.Address)
	if err != nil {
		return nil, err
	}
	relative, err := url.Parse(path)
	if err != nil {
		return nil, err
	}
	u := base.ResolveReference(relative)
	if u.Scheme != base.Scheme || u.Host != base.Host {
		return nil, errors.New(errors.InvalidInput, "Invalid request destination")
	}
	_, err = o.HelloCache.MemberHello(ctx, o.Address, o.Pin, o.Fetcher)

	if err != nil {
		return nil, err
	}
	nonce := make([]byte, 16)
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	value := p.Request{ServerPin: o.Pin, VaultId: o.VaultID, Method: method, PathAndQuery: u.EscapedPath(), BodyHash: crypto.SHA256(serialized), Time: uint64(o.Now()), Nonce: nonce, Device: o.Identity.Record.Id, ClientVersion: o.Version}
	if u.RawQuery != "" {
		value.PathAndQuery += "?" + u.RawQuery
	}
	encoded, err := b.Encode(p.RequestCodec, value)
	if err != nil {
		return nil, err
	}
	signed, err := requests.SignRequest(value, o.Identity.Keys.ReqSk)
	if err != nil {
		return nil, err
	}
	record, err := b.Encode(members.DeviceRecordCodec, o.Identity.Record)
	if err != nil {
		return nil, err
	}
	requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	req, err := http.NewRequestWithContext(requestCtx, method, u.String(), bytes.NewReader(serialized))
	if err != nil {
		cancel()
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, v := range map[string]string{"Envden-Request": Text(encoded), "Envden-Device": Text(value.Device), "Envden-Body-Hash": Text(value.BodyHash), "Envden-Time": strconv.FormatUint(value.Time, 10), "Envden-Nonce": Text(nonce), "Envden-Signature": Text(signed.Signature), "Envden-Device-Record": Text(record)} {
		req.Header.Set(key, v)
	}
	if o.Proof != nil {
		proof, e := o.Proof(value)
		if e != nil {
			cancel()
			return nil, e
		}
		req.Header.Set("Envden-Proof", Text(proof))
	}
	response, err := ServerFetch(o.Fetcher, req)
	if err != nil {
		cancel()
		return nil, err
	}
	response.Body = &cancelBody{ReadCloser: response.Body, cancel: cancel}
	if response.StatusCode == 426 {
		response.Body.Close()
		return nil, c.checkServerMinimum(ctx)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		err = ResponseError(response, u.Path)
		if errors.Is(err, errors.Locked) && retry && o.Unlock != nil {
			if err = o.Unlock(ctx); err != nil {
				return nil, err
			}
			return c.signedRequest(ctx, path, method, body, false)
		}
		return nil, err
	}
	if o.Authenticated != nil {
		if err = o.Authenticated(); err != nil {
			response.Body.Close()
			return nil, err
		}
	}
	if err = authenticated(ctx); err != nil { response.Body.Close(); return nil,err }
	return response, nil
}
