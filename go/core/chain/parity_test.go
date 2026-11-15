package chain_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	d "github.com/notsuhas/envden/go/core/chain/devices"
	f "github.com/notsuhas/envden/go/core/chain/manifests"
	r "github.com/notsuhas/envden/go/core/chain/repair"
	sw "github.com/notsuhas/envden/go/core/chain/swaps"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	server "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type vector struct {
	Name     string
	TestName string
	Args     []json.RawMessage
	Result   json.RawMessage
	Error    *failure
	Calls    []sourceCall
}

func TestTypeScriptChainCases(t *testing.T) {
	raw, err := os.ReadFile("testdata/typescript.json")
	if err != nil {
		t.Fatal(err)
	}
	rows := decode[[]vector](raw)
	for i, row := range rows {
		t.Run(fmt.Sprintf("%s/%s/%03d", row.TestName, row.Name, i), func(t *testing.T) {
			got, err := run(row)
			if row.Error != nil {
				if err == nil || err.Error() != row.Error.Error {
					t.Fatalf("expected error %v, got %v", row.Error, err)
				}
				if row.Error.Code != "" && !e.Is(err, row.Error.Code) {
					t.Fatalf("wrong error code: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			encoded, err := json.Marshal(got)
			if err != nil {
				t.Fatal(err)
			}
			equalJSON(t, decode[any](row.Result), decode[any](encoded), row.Name)
		})
	}
}

func run(v vector) (any, error) {
	a := v.Args
	switch v.Name {
	case "applyEntry":
		state := decode[*d.State](a[0])
		before, _ := json.Marshal(state)
		result, err := d.ApplyEntry(state, decode[c.Signed[c.Entry]](a[1]))
		after, _ := json.Marshal(state)
		if !bytes.Equal(before, after) {
			return nil, fmt.Errorf("ApplyEntry mutated its previous state")
		}
		return result, err
	case "verifyChain":
		return d.VerifyChain(decode[[]c.Signed[c.Entry]](a[0]))
	case "validateSwap":
		context := decode[sw.Context](a[1])
		before, _ := json.Marshal(context)
		result, err := sw.ValidateSwap(decode[m.Swap](a[0]), context)
		after, _ := json.Marshal(context)
		if !bytes.Equal(before, after) {
			return nil, fmt.Errorf("ValidateSwap mutated its context")
		}
		return result, err
	case "acceptManifest":
		var input struct {
			Checkpoint    f.Checkpoint
			Head          b.Signed[m.ManifestHeader]
			StoredHeaders []b.Signed[m.ManifestHeader]
			LocalFileIds  map[string]bool
		}
		input = decode[acceptFixtureInput](a[0])
		return f.AcceptManifest(f.AcceptInput{Checkpoint: input.Checkpoint, Head: input.Head, StoredHeaders: input.StoredHeaders, LocalFileIds: input.LocalFileIds, Source: source{v.Calls}})
	case "classifyNonMember":
		return f.ClassifyNonMember(decode[f.NonMemberInput](a[0]))
	case "checkedFiles":
		return f.CheckedFiles(decode[*m.Files](a[0]), decode[[]byte](a[1]))
	case "changedFiles":
		var op []int
		if len(a) > 4 {
			op = []int{decode[int](a[4])}
		}
		return f.ChangedFiles(decode[m.Files](a[0]), decode[m.Files](a[1]), decode[int](a[2]), decode[int](a[3]), op...)
	case "checkHeaderSignature":
		return nil, f.CheckHeaderSignature(source{v.Calls}, decode[*d.State](a[1]), decode[b.Signed[m.ManifestHeader]](a[2]))
	case "filterRepairReports":
		return r.FilterRepairReports(decode[r.ReportsInput](a[0]))
	case "missingReportMembers":
		return r.MissingReportMembers(decode[*d.State](a[0]), decode[[]b.Signed[server.RepairReport]](a[1])), nil
	case "classifyMissingBlobs":
		return r.ClassifyMissingBlobs(decode[m.Files](a[0]), decode[map[string]bool](a[1]), decode[[]b.Signed[server.RepairReport]](a[2])), nil
	case "chooseRecoveryCandidate":
		return r.ChooseRecoveryCandidate(decode[r.CandidateInput](a[0]))
	case "repairLoginDecision":
		return r.RepairLoginDecision(decode[[]m.ManifestHeader](a[0])), nil
	case "refuseSecretKeyProof":
		return r.RefuseSecretKeyProof(decode[[]m.ManifestHeader](a[0]), decode[bool](a[1])), nil
	case "isReusedRepairToken":
		return r.IsReusedRepairToken(decode[[]byte](a[0]), decode[map[string]bool](a[1])), nil
	}

	return nil, fmt.Errorf("unknown vector %s", v.Name)
}

type acceptFixtureInput = struct {
	Checkpoint    f.Checkpoint
	Head          b.Signed[m.ManifestHeader]
	StoredHeaders []b.Signed[m.ManifestHeader]
	LocalFileIds  map[string]bool
}
