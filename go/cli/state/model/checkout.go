package model

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
)

func (c *Checkout) UnmarshalJSON(data []byte) error {
	type plain Checkout
	if err := json.Unmarshal(data, (*plain)(c)); err != nil {
		return err
	}
	parsed, err := jsonvalue.Parse(data)
	if err != nil {
		return err
	}
	c.Order = nil
	for _, field := range parsed.(jsonvalue.Object) {
		c.Order = append(c.Order, field.Key)
	}

	return nil
}

func (c Checkout) MarshalJSON() ([]byte, error) {
	type plain Checkout
	raw, err := jsonvalue.Marshal(plain(c))
	if err != nil {
		return nil, err
	}
	parsed, err := jsonvalue.Parse(raw)
	if err != nil {
		return nil, err
	}
	values := parsed.(jsonvalue.Object)
	ordered := jsonvalue.Object{}
	for _, key := range c.Order {
		for _, field := range values {
			if key == field.Key {
				ordered.Set(key, field.Value)
			}
		}
	}
	for _, field := range values {
		ordered.Set(field.Key, field.Value)
	}

	return jsonvalue.Marshal(ordered)
}
