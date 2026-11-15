package crypto

import "crypto/rand"

type Random func(int) []byte

func RandomBytes(n int) []byte {
	v := make([]byte, n)
	if _, err := rand.Read(v); err != nil {
		panic(err)
	}

	return v
}

func RNG(rng []Random) Random {
	if len(rng) > 0 && rng[0] != nil {
		return rng[0]
	}

	return RandomBytes
}
