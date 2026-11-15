package view

import (
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/merge"
)

func KeyChangesView(result merge.Result) jsonvalue.Object {
	if result.Kind == "diff" {
		return jsonvalue.Object{{Key: "kind", Value: "diff"}, {Key: "added", Value: nonNil(result.Added)}, {Key: "removed", Value: nonNil(result.Removed)}, {Key: "changed", Value: nonNil(result.Changed)}}
	}
	value := jsonvalue.Object{{Key: "kind", Value: "unparsed"}, {Key: "reason", Value: result.Reason}}
	if result.Key != "" {
		value.Set("key", result.Key)
	}
	return value
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
