package encoding

func Pad(data []byte) []byte { return Concat(data, make([]byte, (256-len(data)%256)%256)) }

func DecodePadded[T any](c Codec[T], data []byte) (T, error) {
	return Try(func() T {
		RequireValue(len(data)%256 == 0, "Invalid padded length")
		r := &Reader{Data: data}
		v := c.Read(r)
		rest := r.Take(len(data) - r.Offset)
		RequireValue(len(rest) < 256, "Invalid padding")
		for _, b := range rest {
			RequireValue(b == 0, "Invalid padding")
		}

		return v
	})
}
