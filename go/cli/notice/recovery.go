package notice

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RecoveryJoins(values []string, ownID []byte) (jsonvalue.Object, error) {
	signed := []encoding.Signed[codecs.Entry]{}
	names := map[string]string{}
	var ownJoin *uint64
	for _, value := range values {
		raw, e := client.Binary(value)
		if e != nil {
			return nil, e
		}

		entry, e := encoding.Decode(encoding.SignedCodec(codecs.EntryCodec), raw)
		if e != nil {
			return nil, e
		}

		signed = append(signed, entry)
		var id []byte
		name := ""
		switch v := entry.Body.Payload.(type) {
		case entrypayloads.Genesis:
			id = v.Device.Id
			name = v.Device.Name
		case entrypayloads.AddDevice:
			id = v.Device.Id
			name = v.Device.Name
		case entrypayloads.RenameDevice:
			id = v.Device
			name = v.Name
		}

		if id != nil {
			names[encoding.Base32(id)] = name
		}

		if ownJoin == nil && (entry.Body.Kind == 0 || entry.Body.Kind == 1) && ownID != nil && bytes.Equal(id, ownID) {
			seq := entry.Body.Seq
			ownJoin = &seq
		}
	}

	notices := jsonvalue.Object{}
	var recovery []byte
	for _, event := range signed {
		entry := event.Body
		if v, ok := entry.Payload.(entrypayloads.AddDevice); ok && recovery != nil && bytes.Equal(entry.Signer, recovery) && (ownJoin == nil || entry.Seq > *ownJoin) {
			hash, e := crypto.ObjectHash(codecs.EntryCodec, event, "entry")
			if e != nil {
				return nil, e
			}

			notices.Set(client.Text(hash), names[encoding.Base32(v.Device.Id)])
		}

		switch v := entry.Payload.(type) {
		case entrypayloads.Genesis:
			recovery = v.Recovery.Id
		case entrypayloads.ReplaceRecovery:
			recovery = v.Recovery.Id
		case entrypayloads.RemoveDevice:
			if v.NewRecovery != nil {
				recovery = v.NewRecovery.Id
			}
		}
	}

	return notices, nil
}

func PrintRecoveryJoins(home string, notices jsonvalue.Object, now func() int64, w io.Writer) error {
	path := filepath.Join(home, "state", "recovery-notice")
	raw, e := files.OptionalRead(path)
	if e != nil {
		return e
	}

	seen := []string{}
	if raw != nil {
		if e = json.Unmarshal([]byte(*raw), &seen); e != nil {
			return e
		}
	}

	for _, f := range notices {
		already := false
		for _, id := range seen {
			if id == f.Key {
				already = true
			}
		}

		if !already {
			_, _ = fmt.Fprintln(w, "envden: "+output.SanitizeTerminal(f.Value.(string))+" joined with the recovery kit")
			seen = append(seen, f.Key)
		}
	}

	data, e := jsonvalue.Marshal(seen)
	if e != nil {
		return e
	}

	return files.AtomicWrite(path, data, now)
}

func ReportRecoveryJoins(home string, state *model.State, ownID []byte, now func() int64, w io.Writer) error {
	notices, e := RecoveryJoins(state.Entries, ownID)
	if e != nil {
		return e
	}

	return PrintRecoveryJoins(home, notices, now, w)
}
