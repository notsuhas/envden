package server

import "net/http"

type bufferedResponse struct {
	header http.Header
	code   int
	body   []byte
}

func newBufferedResponse() *bufferedResponse {
	return &bufferedResponse{header: http.Header{}, code: http.StatusOK}
}

func (b *bufferedResponse) Header() http.Header { return b.header }

func (b *bufferedResponse) WriteHeader(code int) { b.code = code }

func (b *bufferedResponse) Write(data []byte) (int, error) {
	b.body = append(b.body, data...)

	return len(data), nil
}

func (b *bufferedResponse) flush(w http.ResponseWriter) {
	for key, values := range b.header {
		w.Header()[key] = values
	}

	w.WriteHeader(b.code)
	_, _ = w.Write(b.body)
}
