package sqlite

import (
	"os"
	"syscall"
)

func (s *storage) collectGarbage() error {
	if s.depth != 0 {
		return nil
	}

	return s.tx(func() error {
		r, err := s.rows("SELECT vault,hash FROM blob_garbage")
		if err != nil {
			return err
		}

		defer func() { _ = r.Close() }()
		type pair struct{ v, h []byte }
		rows := []pair{}
		for r.Next() {
			var p pair
			if err := r.Scan(&p.v, &p.h); err != nil {
				return err
			}

			rows = append(rows, p)
		}
		if err := r.Close(); err != nil {
			return err
		}

		for _, p := range rows {
			bytesResult, err := s.bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", p.v, p.h)
			if err != nil {
				return err
			}
			if bytesResult == nil {
				e := syscall.Unlink(s.blobPath(p.v, p.h))
				if e != nil && !os.IsNotExist(e) {
					continue
				}
			}
			_, err = s.run("DELETE FROM blob_garbage WHERE vault=? AND hash=?", p.v, p.h)
			if err != nil {
				return err
			}
		}

		return nil
	})
}
