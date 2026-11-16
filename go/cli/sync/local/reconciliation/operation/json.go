package operation

import "github.com/notsuhas/envden/go/cli/jsonvalue"

func (o Operation) MarshalJSON() ([]byte, error) {
	if !o.parsed {
		type plain Operation
		return jsonvalue.Marshal(plain(o))
	}
	return jsonvalue.Marshal(jsonvalue.Object{{Key: "targets", Value: o.Targets}, {Key: "before", Value: o.Before}, {Key: "written", Value: o.Written}, {Key: "next", Value: o.Next}, {Key: "server", Value: o.Server}, {Key: "header", Value: o.Header}, {Key: "entry", Value: o.Entry}})
}
