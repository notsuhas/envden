package pako

var extraLength = []int{0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0}
var extraDistance = []int{0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13}
var extraBits = []int{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7}
var bitOrder = []int{16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15}
var staticLiteral [576]int
var staticDistance [60]int
var lengthCode [256]int
var distanceCode [512]int
var baseLength [29]int
var baseDistance [30]int

func init() {
	length := 0
	for code := 0; code < 28; code++ {
		baseLength[code] = length
		for n := 0; n < 1<<extraLength[code]; n++ {
			lengthCode[length] = code
			length++
		}
	}
	lengthCode[length-1] = 28
	distance := 0
	for code := 0; code < 16; code++ {
		baseDistance[code] = distance
		for n := 0; n < 1<<extraDistance[code]; n++ {
			distanceCode[distance] = code
			distance++
		}
	}
	distance >>= 7
	for code := 16; code < 30; code++ {
		baseDistance[code] = distance << 7
		for n := 0; n < 1<<(extraDistance[code]-7); n++ {
			distanceCode[256+distance] = code
			distance++
		}
	}
	var counts [16]int
	for n := 0; n < 288; n++ {
		bits := 8
		if n >= 144 && n <= 255 {
			bits = 9
		} else if n >= 256 && n <= 279 {
			bits = 7
		}
		staticLiteral[n*2+1] = bits
		counts[bits]++
	}
	generateCodes(staticLiteral[:], 287, counts)
	for n := 0; n < 30; n++ {
		staticDistance[n*2+1] = 5
		staticDistance[n*2] = reverse(n, 5)
	}
}

func distanceIndex(distance int) int {
	if distance < 256 {
		return distanceCode[distance]
	}

	return distanceCode[256+(distance>>7)]
}

func reverse(code, length int) int {
	result := 0
	for ; length > 0; length-- {
		result = result<<1 | code&1
		code >>= 1
	}

	return result
}

func generateCodes(tree []int, maxCode int, counts [16]int) {
	var next [16]int
	code := 0
	for bits := 1; bits <= 15; bits++ {
		code = (code + counts[bits-1]) << 1
		next[bits] = code
	}
	for n := 0; n <= maxCode; n++ {
		length := tree[n*2+1]
		if length == 0 {
			continue
		}
		tree[n*2] = reverse(next[length], length)
		next[length]++
	}
}
