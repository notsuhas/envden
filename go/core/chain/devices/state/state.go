package state

import (
	m "github.com/notsuhas/envden/go/core/protocol/codecs/members"
)

type State struct {
	DeviceOrder []string // Preserve TS Map insertion order in member reports.
	VaultId     []byte
	Seq         uint64
	Head        []byte
	Devices     map[string]m.DeviceRecord
	Recovery    m.RecoveryRecord
	Epoch       int
	ServerPin   []byte
	EverUsedIds map[string]bool
	RepairIds   map[string]bool
	Commits     map[int][]byte
}
