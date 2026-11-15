package pako

func (s *state) send(value, length int) {
	s.bits |= uint64(value) << s.valid
	s.valid += length
	for s.valid >= 8 {
		s.output = append(s.output, byte(s.bits))
		s.bits >>= 8
		s.valid -= 8
	}
}

func (s *state) code(code int, tree []int) { s.send(tree[code*2], tree[code*2+1]) }

func (s *state) align() {
	if s.valid > 0 {
		s.output = append(s.output, byte(s.bits))
	}
	s.bits = 0
	s.valid = 0
}

func (s *state) resetBlock() {
	for n := 0; n < 286; n++ {
		s.literal[n*2] = 0
	}
	for n := 0; n < 30; n++ {
		s.distance[n*2] = 0
	}
	for n := 0; n < 19; n++ {
		s.lengths[n*2] = 0
	}
	s.literal[512] = 1
	s.optimal = 0
	s.static = 0
	s.tokens = s.tokens[:0]
}

func (s *state) tally(distance, value int) bool {
	s.tokens = append(s.tokens, token{distance, value})
	if distance == 0 {
		s.literal[value*2]++
	} else {
		s.literal[(lengthCode[value]+257)*2]++
		s.distance[distanceIndex(distance-1)*2]++
	}

	return len(s.tokens) == 16383
}

func (s *state) compress(literal, distance []int) {
	for _, t := range s.tokens {
		if t.distance == 0 {
			s.code(t.value, literal)
			continue
		}
		code := lengthCode[t.value]
		s.code(code+257, literal)
		if extraLength[code] != 0 {
			s.send(t.value-baseLength[code], extraLength[code])
		}
		dist := t.distance - 1
		code = distanceIndex(dist)
		s.code(code, distance)
		if extraDistance[code] != 0 {
			s.send(dist-baseDistance[code], extraDistance[code])
		}
	}
	s.code(256, literal)
}

func (s *state) flush(last bool) {
	l := treeDescription{tree: s.literal[:], fixed: staticLiteral[:], extra: extraLength, base: 257, elements: 286, maxLength: 15}
	d := treeDescription{tree: s.distance[:], fixed: staticDistance[:], extra: extraDistance, elements: 30, maxLength: 15}
	s.build(&l)
	s.build(&d)
	index := s.header(&l, &d)
	optimal := (s.optimal + 10) >> 3
	fixed := (s.static + 10) >> 3
	optimal = min(optimal, fixed)
	stored := s.position - s.blockStart
	final := 0
	if last {
		final = 1
	}
	if stored+4 <= optimal && s.blockStart >= 0 {
		s.send(final, 3)
		s.align()
		s.output = append(s.output, byte(stored), byte(stored>>8), byte(^stored), byte(^stored>>8))
		s.output = append(s.output, s.window[s.blockStart:s.position]...)
	} else if fixed == optimal {
		s.send(2+final, 3)
		s.compress(staticLiteral[:], staticDistance[:])
	} else {
		s.send(4+final, 3)
		s.sendHeader(&l, &d, index)
		s.compress(l.tree, d.tree)
	}
	s.resetBlock()
	s.blockStart = s.position
	if last {
		s.align()
	}
}
