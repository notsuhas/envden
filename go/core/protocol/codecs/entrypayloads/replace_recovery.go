package entrypayloads

import (
	epochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ReplaceRecovery struct {
	Recovery members.RecoveryRecord
	Change   epochs.EpochChange
}

var ReplaceRecoveryCodec = b.NewCodec(func(r *b.Reader) ReplaceRecovery {
	return ReplaceRecovery{Recovery: members.RecoveryRecordCodec.Read(r), Change: epochs.EpochChangeCodec.Read(r)}
}, func(v ReplaceRecovery) []byte {
	return b.Concat(members.RecoveryRecordCodec.Write(v.Recovery), epochs.EpochChangeCodec.Write(v.Change))
}, nil)
