package chain_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	manifestchain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/chain/swaps"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
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
				if row.Error.Code != "" && !enverrors.Is(err, row.Error.Code) {
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
		state := decode[*devicechain.State](a[0])
		before, _ := json.Marshal(state)
		result, err := devicechain.ApplyEntry(state, decode[codecs.Signed[codecs.Entry]](a[1]))
		after, _ := json.Marshal(state)
		if !bytes.Equal(before, after) {
			return nil, fmt.Errorf("ApplyEntry mutated its previous state")
		}

		return result, err
	case "verifyChain":
		return devicechain.VerifyChain(decode[[]codecs.Signed[codecs.Entry]](a[0]))
	case "validateSwap":
		context := decode[swaps.Context](a[1])
		before, _ := json.Marshal(context)
		result, err := swaps.ValidateSwap(decode[manifests.Swap](a[0]), context)
		after, _ := json.Marshal(context)
		if !bytes.Equal(before, after) {
			return nil, fmt.Errorf("ValidateSwap mutated its context")
		}

		return result, err
	case "acceptManifest":
		var input struct {
			Checkpoint    manifestchain.Checkpoint
			Head          encoding.Signed[manifests.ManifestHeader]
			StoredHeaders []encoding.Signed[manifests.ManifestHeader]
			LocalFileIds  map[string]bool
		}
		input = decode[acceptFixtureInput](a[0])

		return manifestchain.AcceptManifest(manifestchain.AcceptInput{Checkpoint: input.Checkpoint, Head: input.Head, StoredHeaders: input.StoredHeaders, LocalFileIds: input.LocalFileIds, Source: source{v.Calls}})
	case "classifyNonMember":
		return manifestchain.ClassifyNonMember(decode[manifestchain.NonMemberInput](a[0]))
	case "checkedFiles":
		return manifestchain.CheckedFiles(decode[*manifests.Files](a[0]), decode[[]byte](a[1]))
	case "changedFiles":
		var op []int
		if len(a) > 4 {
			op = []int{decode[int](a[4])}
		}

		return manifestchain.ChangedFiles(decode[manifests.Files](a[0]), decode[manifests.Files](a[1]), decode[int](a[2]), decode[int](a[3]), op...)
	case "checkHeaderSignature":
		return nil, manifestchain.CheckHeaderSignature(source{v.Calls}, decode[*devicechain.State](a[1]), decode[encoding.Signed[manifests.ManifestHeader]](a[2]))
	case "filterRepairReports":
		return repair.FilterRepairReports(decode[repair.ReportsInput](a[0]))
	case "missingReportMembers":
		return repair.MissingReportMembers(decode[*devicechain.State](a[0]), decode[[]encoding.Signed[server.RepairReport]](a[1])), nil
	case "classifyMissingBlobs":
		return repair.ClassifyMissingBlobs(decode[manifests.Files](a[0]), decode[map[string]bool](a[1]), decode[[]encoding.Signed[server.RepairReport]](a[2])), nil
	case "chooseRecoveryCandidate":
		return repair.ChooseRecoveryCandidate(decode[repair.CandidateInput](a[0]))
	case "repairLoginDecision":
		return repair.RepairLoginDecision(decode[[]manifests.ManifestHeader](a[0])), nil
	case "refuseSecretKeyProof":
		return repair.RefuseSecretKeyProof(decode[[]manifests.ManifestHeader](a[0]), decode[bool](a[1])), nil
	case "isReusedRepairToken":
		return repair.IsReusedRepairToken(decode[[]byte](a[0]), decode[map[string]bool](a[1])), nil
	}

	return nil, fmt.Errorf("unknown vector %s", v.Name)
}

type acceptFixtureInput = struct {
	Checkpoint    manifestchain.Checkpoint
	Head          encoding.Signed[manifests.ManifestHeader]
	StoredHeaders []encoding.Signed[manifests.ManifestHeader]
	LocalFileIds  map[string]bool
}
