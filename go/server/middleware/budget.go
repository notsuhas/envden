package middleware

import (
	e "github.com/notsuhas/envden/go/core/errors"
	x "github.com/notsuhas/envden/go/server/shared"
	"sync"
)

type budget struct {
	capacity, reserved  int64
	concurrency, active int
}
type BodyBudget struct {
	mu              sync.Mutex
	budgets         map[string]*budget
	devices, vaults map[string]int64
}

func NewBodyBudget() *BodyBudget {
	return &BodyBudget{budgets: map[string]*budget{"member": {capacity: 134217728, concurrency: int(^uint(0) >> 1)}, "authorized": {capacity: 134217728, concurrency: 2}, "public": {capacity: 1048576, concurrency: 8}}, devices: map[string]int64{}, vaults: map[string]int64{}}
}
func (b *BodyBudget) Reserve(size int64, kind string, vault, device []byte) func() {
	if size == 0 {
		return func() {}
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if kind == "" {
		kind = "member"
	}
	budget := b.budgets[kind]
	vk, dk := "", ""
	if kind == "member" && vault != nil {
		vk = x.Text(vault)
		dk = vk + ":" + x.Text(device)
	}
	if budget.reserved+size > budget.capacity || budget.active >= budget.concurrency || dk != "" && b.devices[dk]+size > 67108864 || vk != "" && b.vaults[vk]+size > 100663296 {
		x.Fail(e.Busy, "Body budget exceeded")
	}
	budget.reserved += size
	budget.active++
	if dk != "" {
		b.devices[dk] += size
	}
	if vk != "" {
		b.vaults[vk] += size
	}
	once := sync.Once{}
	return func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			budget.reserved -= size
			budget.active--
			if dk != "" {
				b.devices[dk] -= size
				if b.devices[dk] == 0 {
					delete(b.devices, dk)
				}
			}
			if vk != "" {
				b.vaults[vk] -= size
				if b.vaults[vk] == 0 {
					delete(b.vaults, vk)
				}
			}
		})
	}
}
