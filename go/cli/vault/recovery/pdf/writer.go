package pdf

import (
	"bytes"
	"fmt"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/notsuhas/envden/go/lib/pako"
)

func hexString(value string) string {
	var out strings.Builder
	out.WriteString("<FEFF")
	for _, c := range utf16.Encode([]rune(value)) {
		fmt.Fprintf(&out, "%04X", c)
	}

	out.WriteByte('>')

	return out.String()
}

func serialize(title, resources string, content []byte, metadataTime int64) ([]byte, error) {
	stream := pako.Deflate(content)
	producer := hexString("pdf-lib (https://github.com/Hopding/pdf-lib)")
	date := time.UnixMilli(metadataTime).UTC().Format("20060102150405")
	objects := []string{"<<\n/Type /Pages\n/Kids [ 4 0 R ]\n/Count 1\n>>", "<<\n/Type /Catalog\n/Pages 1 0 R\n>>", fmt.Sprintf("<<\n/Producer %s\n/ModDate (D:%sZ)\n/Creator %s\n/CreationDate (D:%sZ)\n/Title %s\n>>", producer, date, producer, date, hexString(title)), "<<\n/Type /Page\n/Parent 1 0 R\n/Resources <<\n/Font <<\n" + resources + ">>\n/XObject <<\n>>\n/ExtGState <<\n>>\n>>\n/MediaBox [ 0 0 595.28 841.89 ]\n/Annots [ ]\n/Contents [ 8 0 R ]\n>>"}
	for _, name := range []string{"Helvetica", "Helvetica-Bold", "Courier"} {
		objects = append(objects, "<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /"+name+"\n/Encoding /WinAnsiEncoding\n>>")
	}

	objects = append(objects, fmt.Sprintf("<<\n/Filter /FlateDecode\n/Length %d\n>>\nstream\n", len(stream))+string(stream)+"\nendstream")
	var result bytes.Buffer
	result.WriteString("%PDF-1.7\n%\x81\x81\x81\x81\n\n")
	offsets := []int{}
	for i, object := range objects {
		offsets = append(offsets, result.Len())
		fmt.Fprintf(&result, "%d 0 obj\n%s\nendobj\n\n", i+1, object)
	}

	xref := result.Len()
	fmt.Fprintf(&result, "xref\n0 9\n0000000000 65535 f \n")
	for _, offset := range offsets {
		fmt.Fprintf(&result, "%010d 00000 n \n", offset)
	}

	fmt.Fprintf(&result, "\ntrailer\n<<\n/Size 9\n/Root 2 0 R\n/Info 3 0 R\n>>\n\nstartxref\n%d\n%%%%EOF", xref)

	return result.Bytes(), nil
}
