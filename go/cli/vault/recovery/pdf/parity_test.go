package pdf

import (
 "bytes"
 "encoding/json"
 "os"
 "testing"

 "github.com/notsuhas/envden/go/lib/pako"
)

func TestPDFLibBytes(t *testing.T) {
 raw,err:=os.ReadFile("testdata/reference.json")
 if err!=nil { t.Fatal(err) }
 var cases []struct { Document Document; MetadataTime int64; PDF,Content,Compressed []byte }
 if err=json.Unmarshal(raw,&cases); err!=nil { t.Fatal(err) }
 for i,c:=range cases {
  if got:=pako.Deflate(c.Content); !bytes.Equal(got,c.Compressed) { t.Errorf("case %d: pako content differs",i) }
  got,err:=RenderKit(c.Document,c.MetadataTime)
  if err!=nil { t.Fatal(err) }
  if !bytes.Equal(got,c.PDF) {
   first:=0
   for first<min(len(got),len(c.PDF)) && got[first]==c.PDF[first] { first++ }
   t.Errorf("case %d: PDF differs at offset %d (Go %d bytes, pdf-lib %d bytes)",i,first,len(got),len(c.PDF))
  }
 }
}
