package pako

type treeDescription struct {
	tree, fixed, extra                 []int
	base, elements, maxLength, maxCode int
}

func (s *state) smaller(tree []int, n, m int) bool {
	return tree[n*2] < tree[m*2] || tree[n*2] == tree[m*2] && s.depth[n] <= s.depth[m]
}

func (s *state) down(tree []int, k int) {
	value := s.heap[k]
	for j := k << 1; j <= s.heapLen; j <<= 1 {
		if j < s.heapLen && s.smaller(tree, s.heap[j+1], s.heap[j]) {
			j++
		}
		if s.smaller(tree, value, s.heap[j]) {
			break
		}
		s.heap[k] = s.heap[j]
		k = j
	}
	s.heap[k] = value
}

func (s *state) build(d *treeDescription) {
	tree := d.tree
	s.heapLen = 0
	s.heapMax = heapSize
	maxCode := -1
	for n := 0; n < d.elements; n++ {
		if tree[n*2] != 0 {
			s.heapLen++
			s.heap[s.heapLen] = n
			maxCode = n
			s.depth[n] = 0
		} else {
			tree[n*2+1] = 0
		}
	}
	for s.heapLen < 2 {
		node := 0
		if maxCode < 2 {
			maxCode++
			node = maxCode
		}
		s.heapLen++
		s.heap[s.heapLen] = node
		tree[node*2] = 1
		s.depth[node] = 0
		s.optimal--
		if d.fixed != nil {
			s.static -= d.fixed[node*2+1]
		}
	}
	d.maxCode = maxCode
	for n := s.heapLen >> 1; n >= 1; n-- {
		s.down(tree, n)
	}
	node := d.elements
	for {
		n := s.heap[1]
		s.heap[1] = s.heap[s.heapLen]
		s.heapLen--
		s.down(tree, 1)
		m := s.heap[1]
		s.heapMax--
		s.heap[s.heapMax] = n
		s.heapMax--
		s.heap[s.heapMax] = m
		tree[node*2] = tree[n*2] + tree[m*2]
		s.depth[node] = max(s.depth[n], s.depth[m]) + 1
		tree[n*2+1] = node
		tree[m*2+1] = node
		s.heap[1] = node
		node++
		s.down(tree, 1)
		if s.heapLen < 2 {
			break
		}
	}
	s.heapMax--
	s.heap[s.heapMax] = s.heap[1]
	s.bitLengths(d)
	generateCodes(tree, maxCode, s.counts)
}

func (s *state) bitLengths(d *treeDescription) {
	tree := d.tree
	s.counts = [16]int{}
	tree[s.heap[s.heapMax]*2+1] = 0
	overflow := 0
	h := s.heapMax + 1
	for ; h < heapSize; h++ {
		n := s.heap[h]
		bits := tree[tree[n*2+1]*2+1] + 1
		if bits > d.maxLength {
			bits = d.maxLength
			overflow++
		}
		tree[n*2+1] = bits
		if n > d.maxCode {
			continue
		}
		s.counts[bits]++
		extra := 0
		if n >= d.base {
			extra = d.extra[n-d.base]
		}
		frequency := tree[n*2]
		s.optimal += frequency * (bits + extra)
		if d.fixed != nil {
			s.static += frequency * (d.fixed[n*2+1] + extra)
		}
	}
	if overflow == 0 {
		return
	}
	for overflow > 0 {
		bits := d.maxLength - 1
		for s.counts[bits] == 0 {
			bits--
		}
		s.counts[bits]--
		s.counts[bits+1] += 2
		s.counts[d.maxLength]--
		overflow -= 2
	}
	for bits := d.maxLength; bits != 0; bits-- {
		n := s.counts[bits]
		for n != 0 {
			h--
			m := s.heap[h]
			if m > d.maxCode {
				continue
			}
			if tree[m*2+1] != bits {
				s.optimal += (bits - tree[m*2+1]) * tree[m*2]
				tree[m*2+1] = bits
			}
			n--
		}
	}
}
