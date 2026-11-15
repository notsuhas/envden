package conflicts

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
)

func (r Record) MarshalJSON() ([]byte, error) {
	type plain Record
	if len(r.JSONOrder) == 0 {
		return jsonvalue.Marshal(plain(r))
	}
	raw, err := jsonvalue.Marshal(plain(r))
	if err != nil {
		return nil, err
	}
	parsed, err := jsonvalue.Parse(raw)
	if err != nil {
		return nil, err
	}
	values := parsed.(jsonvalue.Object)
	ordered := jsonvalue.Object{}
	for _, key := range r.JSONOrder {
		ordered.Set(key, values.Get(key))
	}

	return jsonvalue.Marshal(ordered)
}

func (r *Record) UnmarshalJSON(raw []byte) error {
	type plain Record

	return json.Unmarshal(raw, (*plain)(r))
}
