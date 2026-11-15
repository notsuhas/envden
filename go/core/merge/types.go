package merge

type Entry struct {
	Key      string
	Raw      []byte
	Exported bool
	Quote    string
	Active   bool
}

type Result struct {
	Kind        string
	Reason      string
	Key         string
	Head        []byte
	Entries     []*Entry
	Tail        []byte
	Bytes       []byte
	ChangedKeys []string
	Added       []string
	Removed     []string
	Changed     []string
	Keys        []string
}

type Labels struct {
	Mine   string
	Theirs string
}

func conflict(reason, key string) Result { return Result{Kind: "conflict", Reason: reason, Key: key} }
