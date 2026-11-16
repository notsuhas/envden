package pdf

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"regexp"
	"strconv"
)

type parsedObject struct {
	dictionary string
	stream     []byte
}

var (
	startXrefPattern = regexp.MustCompile(`startxref\n([0-9]+)\n%%EOF$`)
	lengthPattern    = regexp.MustCompile(`/Length ([0-9]+)`)
	referencePattern = regexp.MustCompile(`\b([0-9]+) 0 R\b`)
)

// parsePDF checks the classic xref and direct-length streams emitted by the recovery kit.
func parsePDF(raw []byte) ([]parsedObject, error) {
	start := startXrefPattern.FindSubmatch(raw)
	if !bytes.HasPrefix(raw, []byte("%PDF-1.7\n")) || start == nil {
		return nil, fmt.Errorf("invalid PDF header or trailer")
	}

	xref, err := strconv.Atoi(string(start[1]))
	if err != nil || xref < 0 || xref >= len(raw) {
		return nil, fmt.Errorf("invalid startxref offset")
	}

	lines := bytes.Split(raw[xref:], []byte("\n"))
	var first, count int
	if len(lines) < 3 || string(lines[0]) != "xref" {
		return nil, fmt.Errorf("missing xref table")
	}

	if n, err := fmt.Sscanf(string(lines[1]), "%d %d", &first, &count); err != nil || n != 2 || first != 0 || count < 2 || count > len(lines)-2 {
		return nil, fmt.Errorf("invalid xref subsection")
	}

	if string(lines[2]) != "0000000000 65535 f " {
		return nil, fmt.Errorf("missing free xref entry")
	}

	offsets := make([]int, count)
	for id := 1; id < count; id++ {
		var generation int
		var state string
		if n, err := fmt.Sscanf(string(lines[id+2]), "%d %d %s", &offsets[id], &generation, &state); err != nil || n != 3 || generation != 0 || state != "n" {
			return nil, fmt.Errorf("invalid xref entry %d", id)
		}

		if offsets[id] <= offsets[id-1] || offsets[id] >= xref {
			return nil, fmt.Errorf("invalid object offset %d", id)
		}
	}

	objects := make([]parsedObject, count-1)
	for id := 1; id < count; id++ {
		end := xref
		if id+1 < count {
			end = offsets[id+1]
		}

		object := bytes.TrimSpace(raw[offsets[id]:end])
		header := []byte(fmt.Sprintf("%d 0 obj\n", id))
		if !bytes.HasPrefix(object, header) || !bytes.HasSuffix(object, []byte("\nendobj")) {
			return nil, fmt.Errorf("invalid object boundary %d", id)
		}

		body := object[len(header) : len(object)-len("\nendobj")]
		parsed, err := parseObject(body)
		if err != nil {
			return nil, fmt.Errorf("object %d: %w", id, err)
		}

		objects[id-1] = parsed
	}

	trailer := bytes.TrimSpace(bytes.Join(lines[count+2:], []byte("\n")))
	if !bytes.HasPrefix(trailer, []byte("trailer\n<<\n")) || !bytes.Contains(trailer, []byte(fmt.Sprintf("/Size %d\n", count))) {
		return nil, fmt.Errorf("invalid trailer size")
	}

	for _, dictionary := range appendDictionaries(objects, string(trailer)) {
		for _, ref := range referencePattern.FindAllStringSubmatch(dictionary, -1) {
			id, err := strconv.Atoi(ref[1])
			if err != nil || id < 1 || id >= count {
				return nil, fmt.Errorf("dangling object reference")
			}
		}
	}

	if !bytes.Contains(trailer, []byte("/Root 2 0 R\n")) || !bytes.Contains(trailer, []byte("/Info 3 0 R\n")) {
		return nil, fmt.Errorf("invalid catalog or metadata reference")
	}

	return objects, nil
}

func appendDictionaries(objects []parsedObject, trailer string) []string {
	dictionaries := []string{trailer}
	for _, object := range objects {
		dictionaries = append(dictionaries, object.dictionary)
	}

	return dictionaries
}

func parseObject(body []byte) (parsedObject, error) {
	start := bytes.Index(body, []byte("\nstream\n"))
	if start < 0 {
		return parsedObject{dictionary: string(body)}, nil
	}

	dictionary := string(body[:start])
	length := lengthPattern.FindStringSubmatch(dictionary)
	if length == nil || !bytes.Contains(body[:start], []byte("/Filter /FlateDecode\n")) {
		return parsedObject{}, fmt.Errorf("invalid stream dictionary")
	}

	size, err := strconv.Atoi(length[1])
	stream := body[start+len("\nstream\n"):]
	if err != nil || size < 0 || size > len(stream) || string(stream[size:]) != "\nendstream" {
		return parsedObject{}, fmt.Errorf("invalid stream length")
	}

	reader, err := zlib.NewReader(bytes.NewReader(stream[:size]))
	if err != nil {
		return parsedObject{}, err
	}

	content, readErr := io.ReadAll(reader)
	closeErr := reader.Close()
	if readErr != nil {
		return parsedObject{}, readErr
	}

	if closeErr != nil {
		return parsedObject{}, closeErr
	}

	return parsedObject{dictionary: lengthPattern.ReplaceAllString(dictionary, "/Length inflated"), stream: content}, nil
}
