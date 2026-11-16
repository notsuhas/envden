package pdf

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/textcase"
)

type pen struct {
	content   strings.Builder
	resources strings.Builder
	seed      int
}

func number(value float64) string {
	if value == 0 {
		return "0"
	}

	return strconv.FormatFloat(value, 'f', -1, 64)
}

func (p *pen) write(text string, x, y float64, font string, size float64, muted bool) {
	p.seed++
	v := math.Sin(float64(p.seed)) * 10000
	key := font + "-" + strconv.FormatInt(int64(math.Floor((v-math.Floor(v))*1e10)), 10)
	ref := 5
	if font == "Helvetica-Bold" {
		ref = 6
	}

	if font == "Courier" {
		ref = 7
	}

	fmt.Fprintf(&p.resources, "/%s %d 0 R\n", key, ref)
	color := "0.1 0.1 0.12"
	if muted {
		color = "0.42 0.42 0.46"
	}

	fmt.Fprintf(&p.content, "q\nBT\n%s rg\n/%s %s Tf\n24 TL\n1 0 0 1 %s %s Tm\n<%s> Tj\nT*\nET\nQ\n", color, key, number(size), number(x), number(y), encodeText(text, font))
}

var words = regexp.MustCompile(`[^ ]* ?`)

func lines(text string, maxWidth float64) []string {
	result := []string{}
	line := ""
	used := 0.0
	add := func(piece string, w float64) {
		if used+w > maxWidth {
			if line != "" {
				result = append(result, line)
			}

			line = ""
			used = 0
		}

		line += piece
		used += w
	}

	for _, word := range words.FindAllString(text, -1) {
		w := width(word, "Helvetica", 11)
		if w <= maxWidth || width(strings.TrimRight(word, " "), "Helvetica", 11) <= maxWidth {
			add(word, w)

			continue
		}

		// A word wider than the column breaks between characters so it stays inside the margin.
		for _, r := range strings.TrimRight(word, " ") {
			add(string(r), width(string(r), "Helvetica", 11))
		}

		if strings.HasSuffix(word, " ") {
			line += " "
			used += width(" ", "Helvetica", 11)
		}
	}

	if line != "" {
		result = append(result, line)
	}

	return result
}

func RenderKit(document Document, metadataTime int64) ([]byte, error) {
	p := pen{}
	y := 841.89 - 64 - 24
	p.write(document.Title, 64, y, "Helvetica-Bold", 24, false)
	y -= 10
	for _, detail := range document.Details {
		y -= 15
		p.write(detail.Label, 64, y, "Helvetica-Bold", 10, true)
		p.write(detail.Value, 120, y, "Helvetica", 10, false)
	}

	top := y - 28
	inner := 595.28 - 128 - 40
	sizes := []float64{}
	height := float64(40 + 36)
	for _, field := range document.Fields {
		size := 12.0
		if field.Large {
			size = 18
		}

		size = math.Min(size, inner/math.Max(width(field.Value, "Courier", 1), 1))
		sizes = append(sizes, size)
		height += 9 + 8 + size
	}

	fmt.Fprintf(&p.content, "q\n0.55 0.55 0.6 RG\n1 w\n[] 0 d\n1 0 0 1 64 %s cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 %s l\n467.28 %s l\n467.28 0 l\nh\nS\nQ\n", number(top-height), number(height), number(height))
	y = top - 20
	for i, row := range document.Fields {
		y -= 9
		p.write(textcase.Upper(row.Label), 84, y, "Helvetica-Bold", 9, true)
		y -= 8 + sizes[i]
		p.write(row.Value, 84, y, "Courier", sizes[i], false)
		y -= 18
	}

	y = top - height - 28
	for _, paragraph := range document.Instructions {
		for _, line := range lines(printable(paragraph, "Helvetica"), 467.28) {
			y -= 16
			p.write(textcase.Trim(line), 64, y, "Helvetica", 11, false)
		}

		y -= 8
	}

	p.write(document.Footer, (595.28-width(document.Footer, "Helvetica", 9))/2, 64, "Helvetica", 9, true)

	return serialize(document.Title, p.resources.String(), []byte(p.content.String()), metadataTime)
}
