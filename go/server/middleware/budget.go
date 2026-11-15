package middleware

import (
	"sync"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/server/shared"
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

func (b *BodyBudget) Reserve(size int64, kind string, vault, device []byte) (func(), error) {
	if size == 0 {
		return func() {}, nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if kind == "" {
		kind = "member"
	}
	budget := b.budgets[kind]
	vk, dk := "", ""
	if kind == "member" && vault != nil {
		vk = shared.Text(vault)
		dk = vk + ":" + shared.Text(device)
	}
	if budget.reserved+size > budget.capacity || budget.active >= budget.concurrency || dk != "" && b.devices[dk]+size > 67108864 || vk != "" && b.vaults[vk]+size > 100663296 {
		return nil, enverrors.New(enverrors.Busy, "Body budget exceeded")
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
	}, nil
}
