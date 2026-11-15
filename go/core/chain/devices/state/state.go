package state

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
)

type State struct {
	DeviceOrder []string
	VaultId     []byte
	Seq         uint64
	Head        []byte
	Devices     map[string]members.DeviceRecord
	Recovery    members.RecoveryRecord
	Epoch       int
	ServerPin   []byte
	EverUsedIds map[string]bool
	RepairIds   map[string]bool
	Commits     map[int][]byte
}
