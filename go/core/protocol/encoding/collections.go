package encoding

func List[T any](item Codec[T], order ...func(T, T) int) Codec[[]T] {
	check := func(v []T) {
		RequireValue(len(v) <= 100000, "List limit")
		if len(order) > 0 {
			for i := 1; i < len(v); i++ {
				RequireValue(order[0](v[i-1], v[i]) < 0, "Unsorted or duplicate list")
			}
		}
	}
	return Codec[[]T]{func(r *Reader) []T {
		n := U32.Read(r)
		RequireValue(n <= 100000, "List limit")
		v := make([]T, n)
		for i := range v {
			v[i] = item.Read(r)
		}
		check(v)

		return v
	}, func(v []T) []byte {
		check(v)
		out := U32.Write(len(v))
		for _, x := range v {
			out = append(out, item.Write(x)...)
		}
		return out
	}}
}

func Opt[T any](item Codec[T]) Codec[*T] {
	return Codec[*T]{func(r *Reader) *T {
		flag := U8.Read(r)
		RequireValue(flag <= 1, "Invalid option")
		if flag == 0 {
			return nil
		}
		v := item.Read(r)

		return &v
	}, func(v *T) []byte {
		if v == nil {
			return []byte{0}
		}
		return Concat([]byte{1}, item.Write(*v))
	}}
}
