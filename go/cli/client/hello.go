package client

import (
	"context"
	"crypto/rand"

	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"io"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"time"
)

type Greeting struct {
	Pin   []byte
	Hello p.ServerHello
}

func Hello(ctx context.Context, address string, pin []byte, fetch Fetch, minServer string) (Greeting, error) {
	base, err := url.Parse(address)
	if err != nil {
		return Greeting{}, err
	}
	u := base.ResolveReference(&url.URL{Path: "/v1/hello"})
	challenge := make([]byte, 32)
	if _, err = rand.Read(challenge); err != nil {
		return Greeting{}, err
	}
	u.RawQuery = "challenge=" + url.QueryEscape(Text(challenge))
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return Greeting{}, err
	}
	response, err := ServerFetch(fetch, req)
	if err != nil {
		return Greeting{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Greeting{}, errors.New(errors.Unauthorized, "Server didn't answer as envden. Check the address points at an envden server")
	}
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return Greeting{}, err
	}
	envelope, parseErr := p.HelloResponseSchema.Decode(raw)
	if parseErr != nil {
		return Greeting{}, errors.Wrap(errors.InvalidData, "Server sent an invalid hello. Check the address points at an envden server", parseErr)
	}
	encoded, err := Binary(envelope.Hello)
	if err != nil {
		return Greeting{}, err
	}
	signed, err := DecodeUntrusted(b.SignedCodec(p.ServerHelloCodec), encoded)
	if err != nil {
		return Greeting{}, err
	}
	presented, err := keys.ServerPin(signed.Body.ServerSignPub)
	if err != nil {
		return Greeting{}, err
	}
	expected := pin
	if expected == nil {
		expected = presented
	}
	verified := requests.VerifyHello(signed, challenge, u.Hostname(), expected, "0.0.0")
	if !verified.OK {
		return Greeting{}, errors.New(errors.Unauthorized, "Server identity doesn't match the expected server. Check the server address")
	}
	if minServer == "" {
		minServer = version.MinServer
	}
	compare, err := versions.CompareSemver(signed.Body.AppVersion, minServer)
	if err != nil {
		return Greeting{}, err
	}
	if compare < 0 {
		return Greeting{}, errors.New(errors.ServerTooOld, "Server is too old for this envden. Update the server")
	}
	if !slices.Contains(signed.Body.Protocols, 1) {
		return Greeting{}, errors.New(errors.UpdateRequired, "Server has no protocol this envden knows. Update envden")
	}
	return Greeting{presented, signed.Body}, nil
}

type HelloCache struct {
	mu      sync.Mutex
	servers map[string]Greeting
}

func NewHelloCache() *HelloCache { return &HelloCache{servers: map[string]Greeting{}} }
func (cache *HelloCache) MemberHello(ctx context.Context, address string, pin []byte, fetch Fetch) (Greeting, error) {
	base, err := url.Parse(address)
	if err != nil {
		return Greeting{}, err
	}
	key := base.Scheme + "://" + base.Host + "/" + Text(pin)
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if greeting, ok := cache.servers[key]; ok {
		return greeting, nil
	}
	greeting, err := Hello(ctx, address, pin, fetch, "")
	if err != nil {
		return Greeting{}, err
	}
	cache.servers[key] = greeting
	return greeting, nil
}
