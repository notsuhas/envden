package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ReplaceRecovery struct {
	Recovery members.RecoveryRecord
	Change   epochs.EpochChange
}

var ReplaceRecoveryCodec = encoding.NewCodec(func(r *encoding.Reader) ReplaceRecovery {
	return ReplaceRecovery{Recovery: members.RecoveryRecordCodec.Read(r), Change: epochs.EpochChangeCodec.Read(r)}
}, func(v ReplaceRecovery) []byte {
	return encoding.Concat(members.RecoveryRecordCodec.Write(v.Recovery), epochs.EpochChangeCodec.Write(v.Change))
}, nil)
