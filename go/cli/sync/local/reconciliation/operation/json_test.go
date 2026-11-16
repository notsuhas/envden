package operation

import (
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
)

func TestEntryCanonicalBase64(t *testing.T) {
	e := manifests.FileEntry{FileId: make([]byte, 32), Version: 1, Epoch: 1, State: 2, BlobHash: make([]byte, 32)}
	encoded := client.Text(manifests.FileEntryCodec.Write(e))
	if _, err := DecodeEntry(encoded); err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{encoded + "\n", encoded[:len(encoded)-1] + "B"} {
		if _, err := DecodeEntry(v); err == nil {
			t.Fatal("accepted noncanonical entry")
		}
	}
}
func TestParsedOperationShape(t *testing.T) {
	raw := `{"targets":[{"root":"r","path":"p","store":"s","mode":"copy","localOnly":true,"originalLink":"x"}],"before":[null,null],"written":[false,false],"entry":null,"header":"` + strings.Repeat("A", 43) + `","next":null,"server":null}`
	o, err := DecodeOperation(raw)
	if err != nil {
		t.Fatal(err)
	}
	got, err := jsonvalue.Marshal(o)
	want := `{"targets":[{"root":"r","path":"p","store":"s","mode":"copy"}],"before":[null,null],"written":[false,false],"next":null,"server":null,"header":"` + strings.Repeat("A", 43) + `","entry":null}`
	if err != nil || string(got) != want {
		t.Fatal(string(got), err)
	}
}
