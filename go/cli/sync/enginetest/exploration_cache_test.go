package enginetest

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"strings"
	"testing"
)

type explorationCache struct {
	fixture  *fixture
	initial  *snapshot
	adapters [3]contracts.Adapters
	layouts  map[string]*explorationWorld
}

func (c *explorationCache) world(t, owner *testing.T, layout []string) *explorationWorld {
	if c.fixture == nil {
		lifetime := &fixtureLifetime{t, owner}
		c.fixture = createFixture(lifetime)
		c.initial = takeSnapshot(lifetime, c.fixture.root)
		c.adapters = [3]contracts.Adapters{c.fixture.first, c.fixture.second, c.fixture.third}
		c.layouts = map[string]*explorationWorld{}
		lifetime.current = owner
	}
	key := strings.Join(layout, "+")
	if c.layouts[key] == nil {
		c.initial.restore(t)
		f := c.fixture
		f.t = t
		f.first, f.second, f.third = c.adapters[0], c.adapters[1], c.adapters[2]
		targets := f.layout(layout...)
		lifetime := &fixtureLifetime{t, owner}
		c.layouts[key] = &explorationWorld{f, targets, takeSnapshot(lifetime, f.root), [2]contracts.Adapters{f.first, f.second}}
		lifetime.current = owner
	}
	return c.layouts[key]
}
