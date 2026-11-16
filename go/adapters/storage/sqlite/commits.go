package sqlite

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
)

func (s *storage) commitSwap(v, expected []byte, swap adapters.StoredSwap, now int64) (adapters.CommitResult, error) {
	var result adapters.CommitResult
	if err := s.tx(func() error {
		findCommittedResult, err := s.findCommitted(v, swap.BodyDigest)
		if err != nil {
			return err
		}
		if findCommittedResult {
			result.Kind = adapters.RetryOfCommitted

			return nil
		}
		head, err := s.head(v)
		if err != nil {
			return err
		}
		if !sameBytes(head, expected) {
			result = adapters.CommitResult{Kind: adapters.HeadMovedResult, Head: head}

			return nil
		}
		before, err := s.vaultUsage(v)
		if err != nil {
			return err
		}
		if err := adapters.PrepareCommit(s, v, swap, now); err != nil {
			return err
		}
		priorFiles, err := s.bytes("SELECT files AS bytes FROM headers WHERE vault=? ORDER BY seq DESC LIMIT 1", v)
		if err != nil {
			return err
		}

		addsContent := swap.Files == nil
		if !addsContent {
			addsContentResult, err := s.addsContent(v, priorFiles, *swap.Files)
			if err != nil {
				return err
			}
			addsContent = addsContentResult
		}

		adds := addsContent
		if swap.Files != nil {
			if err := s.putFileList(v, *swap.Files, now); err != nil {
				return err
			}
			if swap.Files.RetainForever && priorFiles != nil {
				_, err := s.run("UPDATE lists SET permanent=1 WHERE vault=? AND hash=?", v, priorFiles)
				if err != nil {
					return err
				}
			}
		}
		files := swap.FilesHash
		if files == nil && swap.Files != nil {
			files = swap.Files.Hash
		}
		if files == nil {
			files = priorFiles
		}
		if files != nil {
			_, err := s.run("UPDATE lists SET at=? WHERE vault=? AND hash=?", now, v, files)
			if err != nil {
				return err
			}
		}
		_, err = s.run("INSERT INTO headers VALUES(?,?,?,?,?,?)", v, seq(swap.Header.Seq), swap.Header.Hash, swap.Header.Bytes, now, optional(files))
		if err != nil {
			return err
		}

		for _, entry := range swap.Entries {
			_, err := s.run("INSERT INTO entries VALUES(?,?,?,?)", v, seq(entry.Seq), entry.Hash, entry.Bytes)
			if err != nil {
				return err
			}
		}
		if err := adapters.WriteCommitState(s, v, swap); err != nil {
			return err
		}
		if adds {
			vaultUsageResult, err := s.vaultUsage(v)
			if err != nil {
				return err
			}
			if err := s.checkQuota(v, before, vaultUsageResult, 1<<30); err != nil {
				return err
			}
		}
		if swap.Approver != nil {
			_, err := s.run("INSERT OR REPLACE INTO approvers VALUES(?,?,?,?)", v, swap.Approver.Device, swap.Approver.Bytes, now+86400000)
			if err != nil {
				return err
			}
		}
		if swap.ClearRepairReports {
			_, err := s.run("DELETE FROM state WHERE vault=? AND kind='repair-report'", v)
			if err != nil {
				return err
			}
		}
		if swap.CloseMailbox != nil {
			if err := s.closeMailbox(v, *swap.CloseMailbox); err != nil {
				return err
			}
		}
		if swap.SetupTokenHash != nil {
			_, err := s.run("DELETE FROM setup")
			if err != nil {
				return err
			}
		}
		_, err = s.run("INSERT INTO digests VALUES(?,?)", v, swap.BodyDigest)
		if err != nil {
			return err
		}

		_, err = s.run("UPDATE vaults SET head=? WHERE id=?", swap.Header.Hash, v)
		if err != nil {
			return err
		}

		result.Kind = adapters.Committed

		return nil
	}); err != nil {
		return adapters.CommitResult{}, err
	}

	return result, nil
}

func sameBytes(a, b []byte) bool { return (a == nil) == (b == nil) && bytes.Equal(a, b) }

func (s *storage) addsContent(v, prior []byte, next adapters.StoredFiles) (bool, error) {
	if prior == nil {
		return true, nil
	}
	old, err := s.fileList(v, prior)
	if err != nil {
		return false, err
	}
	if old == nil || len(next.Bytes) > len(old) {
		return true, nil
	}
	r, err := s.rows("SELECT blob FROM versions WHERE vault=? AND list=? AND blob IS NOT NULL", v, prior)
	if err != nil {
		return false, err
	}

	defer func() { _ = r.Close() }()
	blobs := map[string]bool{}
	for r.Next() {
		var b []byte
		if err := r.Scan(&b); err != nil {
			return false, err
		}

		blobs[string(b)] = true
	}
	if err := r.Close(); err != nil {
		return false, err
	}

	for _, version := range next.Versions {
		if version.BlobHash != nil && !blobs[string(version.BlobHash)] {
			return true, nil
		}
	}

	return false, nil
}
