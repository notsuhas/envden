package textcase

import (
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

func Lower(text string) string { return cases.Lower(language.Und).String(text) }

func Upper(text string) string { return cases.Upper(language.Und).String(text) }
