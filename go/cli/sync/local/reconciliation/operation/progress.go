package operation

import (
	"encoding/base64"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/history"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
)

func encodedBytes(value []byte) *string {
	if value == nil {
		return nil
	}

	text := base64.StdEncoding.EncodeToString(value)

	return &text
}

func decodedBytes(value *string) []byte {
	if value == nil {
		return nil
	}

	raw, _ := base64.StdEncoding.DecodeString(*value)

	return raw
}

func saveOperation(context *syncmodel.Context, store string, operation *Operation) error {
	raw, err := jsonvalue.Marshal(operation)
	if err != nil {
		return err
	}

	return context.AtomicWrite(localfiles.BasePath(context.Adapters.Home, store)+".pending", raw)
}

func markWritten(context *syncmodel.Context, store string, operation *Operation, index int) error {
	operation.Written[index] = true

	return saveOperation(context, store, operation)
}

func recoverPlaces(context *syncmodel.Context, store string, operation *Operation, next []byte) error {
	home := context.Adapters.Home
	now := context.Options.Now

	if operation.Written[0] {
		if operation.Entry != nil {
			if err := statefiles.AtomicWrite(localfiles.BasePath(home, store)+".entry", []byte(*operation.Entry), now); err != nil {
				return err
			}
		}
		if err := history.SaveBase(localfiles.BasePath(home, store), next, now); err != nil {
			return err
		}
	}

	for i, item := range operation.Targets {
		if item.Mode == "copy" && operation.Written[i+1] {
			if err := history.SaveBase(localfiles.BasePath(home, store, item.Root), next, now); err != nil {
				return err
			}
		}
	}

	return nil
}

func PreservePendingAncestor(home, store string, now func() int64) error {
	base := localfiles.BasePath(home, store)
	operation, err := ReadOperation(base+".pending", now, nil)
	if err != nil || operation == nil {
		return err
	}

	stored, err := localfiles.ReadBytes(store)
	if err != nil {
		return err
	}

	if operation.Entry != nil && sameHash(ContentHash(stored), ContentHash(decodedBytes(operation.Next))) {
		return statefiles.AtomicWrite(base+".entry", []byte(*operation.Entry), now)
	}

	return nil
}
