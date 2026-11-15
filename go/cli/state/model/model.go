package model

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"reflect"
	"strings"
)

type Server struct {
	Address  string `json:"address"`
	Pin      string `json:"pin"`
	Protocol int    `json:"protocol"`
}
type Window struct {
	UnlockedUntil *int64 `json:"unlockedUntil"`
	FreshUntil    int64  `json:"freshUntil"`
}
type Checkout struct {
	Root       string  `json:"root"`
	GitDir     string  `json:"gitDir"`
	RepoID     string  `json:"repoId"`
	Identity   *string `json:"identity,omitempty"`
	RootDevice *int64  `json:"rootDevice,omitempty"`
}
type Link struct {
	Root         string  `json:"root"`
	Path         string  `json:"path"`
	Store        string  `json:"store"`
	Mode         string  `json:"mode"`
	LocalOnly    bool    `json:"localOnly,omitempty"`
	OriginalLink *string `json:"originalLink,omitempty"`
}

type State struct {
	Format          int              `json:"format"`
	VerifiedState   json.RawMessage  `json:"verifiedState,omitempty"`
	AliasAsked      []string         `json:"aliasAsked,omitempty"`
	DeviceName      string           `json:"deviceName"`
	VaultID         string           `json:"vaultId,omitempty"`
	CreationPending string           `json:"creationPending,omitempty"`
	Server          *Server          `json:"server,omitempty"`
	Checkpoint      string           `json:"checkpoint,omitempty"`
	Headers         []string         `json:"-"`
	Entries         []string         `json:"entries"`
	Keyring         string           `json:"keyring,omitempty"`
	Files           string           `json:"files,omitempty"`
	Session         *Window          `json:"session,omitempty"`
	Approved        []Checkout       `json:"approved"`
	Links           []Link           `json:"links"`
	Aliases         jsonvalue.Object `json:"aliases"`
	Telemetry       bool             `json:"telemetry"`
	UpdateCheck     bool             `json:"updateCheck"`
	Latest          string           `json:"-"`
	Order           []string         `json:"-"`
}

func EmptyState(deviceName string) *State {
	return &State{Format: 1, DeviceName: deviceName, Headers: []string{}, Entries: []string{}, Approved: []Checkout{}, Links: []Link{}, Aliases: jsonvalue.Object{}, UpdateCheck: true, Order: []string{"format", "deviceName", "entries", "approved", "links", "aliases", "telemetry", "updateCheck"}}
}

func (s *State) Record() jsonvalue.Object {
	values := jsonvalue.Object{}
	v := reflect.ValueOf(*s)
	t := v.Type()
	for i := 0; i < v.NumField(); i++ {
		tag := strings.Split(t.Field(i).Tag.Get("json"), ",")
		if tag[0] == "-" {
			continue
		}
		if len(tag) > 1 && v.Field(i).IsZero() {
			continue
		}
		values.Set(tag[0], v.Field(i).Interface())
	}
	result := jsonvalue.Object{}
	for _, key := range s.Order {
		for _, f := range values {
			if f.Key == key {
				result.Set(key, f.Value)
			}
		}
	}
	for _, f := range values {
		result.Set(f.Key, f.Value)
	}
	return result
}

func (s *State) UnmarshalJSON(data []byte) error {
	type plain State
	if err := json.Unmarshal(data, (*plain)(s)); err != nil {
		return err
	}
	v, err := jsonvalue.Parse(data)
	if err != nil {
		return err
	}
	for _, f := range v.(jsonvalue.Object) {
		s.Order = append(s.Order, f.Key)
		if f.Key == "aliases" {
			s.Aliases, _ = f.Value.(jsonvalue.Object)
		}
	}
	return nil
}

func (s *State) Touch(keys ...string) {
	for _, key := range keys {
		found := false
		for _, old := range s.Order {
			if old == key {
				found = true
				break
			}
		}
		if !found {
			s.Order = append(s.Order, key)
		}
	}
}
