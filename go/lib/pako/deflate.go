// Package pako ports pako 1.0.11's default, one-shot zlib deflater.
package pako

import "encoding/binary"

const (
	windowSize   = 32768
	minLookahead = 262
	heapSize     = 573
)

type token struct{ distance, value int }

type state struct {
	window                                [65536]byte
	head, prev                            [32768]int
	input                                 []byte
	position, lookahead, blockStart, hash int
	matchLength, matchStart               int
	available                             bool
	tokens                                []token
	literal                               [1146]int
	distance                              [122]int
	lengths                               [78]int
	heap, depth                           [heapSize]int
	heapLen, heapMax                      int
	counts                                [16]int
	optimal, static                       int
	output                                []byte
	bits                                  uint64
	valid                                 int
}

// Deflate matches pako.deflate(data): level 6, windowBits 15, memLevel 8, strategy 0.
func Deflate(data []byte) []byte {
	s := state{input: data, matchLength: 2, output: []byte{0x78, 0x9c}}
	s.resetBlock()
	s.slow()
	var checksum [4]byte
	binary.BigEndian.PutUint32(checksum[:], adler32(data))

	return append(s.output, checksum[:]...)
}

func adler32(data []byte) uint32 {
	a, b := uint32(1), uint32(0)
	for len(data) > 0 {
		n := min(len(data), 2000)
		for _, c := range data[:n] {
			a += uint32(c)
			b += a
		}
		a %= 65521
		b %= 65521
		data = data[n:]
	}

	return b<<16 | a
}

func (s *state) insert() int {
	s.hash = ((s.hash << 5) ^ int(s.window[s.position+2])) & 32767
	previous := s.head[s.hash]
	s.prev[s.position&32767] = previous
	s.head[s.hash] = s.position

	return previous
}

func (s *state) fill() {
	if s.position >= windowSize+(windowSize-minLookahead) {
		copy(s.window[:], s.window[windowSize:])
		s.matchStart -= windowSize
		s.position -= windowSize
		s.blockStart -= windowSize
		for i := range s.head {
			s.head[i] = max(0, s.head[i]-windowSize)
		}
		for i := range s.prev {
			s.prev[i] = max(0, s.prev[i]-windowSize)
		}
	}
	n := copy(s.window[s.position+s.lookahead:], s.input)
	s.input = s.input[n:]
	s.lookahead += n
	if s.lookahead >= 3 {
		s.hash = ((int(s.window[s.position]) << 5) ^ int(s.window[s.position+1])) & 32767
	}
}

func (s *state) longest(current, previous int) int {
	chain := 128
	if previous >= 8 {
		chain >>= 2
	}
	best := previous
	nice := min(128, s.lookahead)
	limit := max(0, s.position-(windowSize-minLookahead))
	for {
		if s.window[current+best] == s.window[s.position+best] && s.window[current+best-1] == s.window[s.position+best-1] && s.window[current] == s.window[s.position] && s.window[current+1] == s.window[s.position+1] {
			length := 2
			for length < 258 && s.window[current+length] == s.window[s.position+length] {
				length++
			}
			if length > best {
				s.matchStart = current
				best = length
				if length >= nice {
					break
				}
			}
		}
		current = s.prev[current&32767]
		chain--
		if current <= limit || chain == 0 {
			break
		}
	}

	return min(best, s.lookahead)
}

func (s *state) slow() {
	for {
		if s.lookahead < minLookahead {
			s.fill()
			if s.lookahead == 0 {
				break
			}
		}
		head := 0
		if s.lookahead >= 3 {
			head = s.insert()
		}
		previous, previousMatch := s.matchLength, s.matchStart
		s.matchLength = 2
		if head != 0 && previous < 16 && s.position-head <= windowSize-minLookahead {
			s.matchLength = s.longest(head, previous)
			if s.matchLength == 3 && s.position-s.matchStart > 4096 {
				s.matchLength = 2
			}
		}
		if previous >= 3 && s.matchLength <= previous {
			maxInsert := s.position + s.lookahead - 3
			flush := s.tally(s.position-1-previousMatch, previous-3)
			s.lookahead -= previous - 1
			for remaining := previous - 2; remaining > 0; remaining-- {
				s.position++
				if s.position <= maxInsert {
					s.insert()
				}
			}
			s.available = false
			s.matchLength = 2
			s.position++
			if flush {
				s.flush(false)
			}
		} else if s.available {
			flush := s.tally(0, int(s.window[s.position-1]))
			if flush {
				s.flush(false)
			}
			s.position++
			s.lookahead--
		} else {
			s.available = true
			s.position++
			s.lookahead--
		}
	}
	if s.available {
		s.tally(0, int(s.window[s.position-1]))
	}
	s.flush(true)
}
