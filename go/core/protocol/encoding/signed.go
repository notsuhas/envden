package encoding

type Signed[T any] struct {
	Body      T
	Signature []byte
}

func SignedCodec[T any](c Codec[T]) Codec[Signed[T]] {
	return Codec[Signed[T]]{
		func(r *Reader) Signed[T] { return Signed[T]{c.Read(r), B64.Read(r)} },
		func(v Signed[T]) []byte { return Concat(c.Write(v.Body), B64.Write(v.Signature)) },
	}
}
