package sync

import "github.com/notsuhas/envden/go/cli/jsonvalue"

func (d DiffResult) MarshalJSON() ([]byte, error) {
	value := jsonvalue.Object{{Key: "root", Value: d.Root}, {Key: "path", Value: d.Path}, {Key: "differs", Value: d.Differs}, {Key: "kind", Value: d.Kind}}

	if d.Kind == "diff" {
		added, removed, changed := d.Added, d.Removed, d.Changed

		if added == nil {
			added = []string{}
		}

		if removed == nil {
			removed = []string{}
		}

		if changed == nil {
			changed = []string{}
		}

		value.Set("added", added)
		value.Set("removed", removed)
		value.Set("changed", changed)
	} else {
		value.Set("reason", d.Reason)

		if d.Key != "" {
			value.Set("key", d.Key)
		}
	}

	return jsonvalue.Marshal(value)
}
