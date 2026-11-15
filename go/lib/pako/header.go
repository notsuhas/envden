package pako

func walkLengths(tree []int, maxCode int, emit func(code, value, bits int)) {
	previous := -1
	next := tree[1]
	count, maximum, minimum := 0, 7, 4
	if next == 0 {
		maximum = 138
		minimum = 3
	}
	tree[(maxCode+1)*2+1] = 65535
	for n := 0; n <= maxCode; n++ {
		current := next
		next = tree[(n+1)*2+1]
		count++
		if count < maximum && current == next {
			continue
		}
		if count < minimum {
			for ; count > 0; count-- {
				emit(current, 0, 0)
			}
		} else if current != 0 {
			if current != previous {
				emit(current, 0, 0)
				count--
			}
			emit(16, count-3, 2)
		} else if count <= 10 {
			emit(17, count-3, 3)
		} else {
			emit(18, count-11, 7)
		}
		count = 0
		previous = current
		if next == 0 {
			maximum = 138
			minimum = 3
		} else if current == next {
			maximum = 6
			minimum = 3
		} else {
			maximum = 7
			minimum = 4
		}
	}
}

func (s *state) header(l, d *treeDescription) int {
	tally := func(code, value, bits int) { s.lengths[code*2]++ }
	walkLengths(l.tree, l.maxCode, tally)
	walkLengths(d.tree, d.maxCode, tally)
	b := treeDescription{tree: s.lengths[:], extra: extraBits, elements: 19, maxLength: 7}
	s.build(&b)
	index := 18
	for index >= 3 && s.lengths[bitOrder[index]*2+1] == 0 {
		index--
	}
	s.optimal += 3*(index+1) + 14

	return index
}

func (s *state) sendHeader(l, d *treeDescription, index int) {
	s.send(l.maxCode+1-257, 5)
	s.send(d.maxCode, 5)
	s.send(index+1-4, 4)
	for rank := 0; rank <= index; rank++ {
		s.send(s.lengths[bitOrder[rank]*2+1], 3)
	}
	emit := func(code, value, bits int) {
		s.code(code, s.lengths[:])
		if bits != 0 {
			s.send(value, bits)
		}
	}
	walkLengths(l.tree, l.maxCode, emit)
	walkLengths(d.tree, d.maxCode, emit)
}
