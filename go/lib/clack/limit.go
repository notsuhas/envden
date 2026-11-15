package clack

import "strings"

func limitRows(rows []string, cursor, available int, ellipsis string) []string {
	count := max(available, 5)
	start := 0
	if cursor >= count-3 {
		start = max(min(cursor-count+3, len(rows)-count), 0)
	}
	before := count < len(rows) && start > 0
	after := count < len(rows) && start+count < len(rows)
	first, last := start, min(start+count, len(rows))
	if before {
		first++
	}
	if after {
		last--
	}
	result := append([]string(nil), rows[first:last]...)
	total := 0
	for _, r := range result {
		total += strings.Count(r, "\n") + 1
	}
	if before {
		total++
	}
	if after {
		total++
	}
	active := cursor - first
	for total > available && len(result) > 1 {
		if (before && active > 0) || active == len(result)-1 {
			if !before {
				total++
				before = true
			}
			total -= strings.Count(result[0], "\n") + 1
			result = result[1:]
			active--
		} else {
			if !after {
				total++
				after = true
			}
			total -= strings.Count(result[len(result)-1], "\n") + 1
			result = result[:len(result)-1]
		}
	}
	if before {
		result = append([]string{ellipsis}, result...)
	}
	if after {
		result = append(result, ellipsis)
	}

	return result
}
