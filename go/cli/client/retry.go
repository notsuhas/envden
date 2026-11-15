package client

import "github.com/notsuhas/envden/go/core/errors"

func RetryHead[T any](run func() (T, error)) (T, error) {
	var value T
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		value, err = run()
		if !errors.Is(err, errors.HeadMoved) {
			break
		}
	}
	return value, err
}
func RetryBusy[T any](run func() (T, error), wait func(int64) error) (T, error) {
	var value T
	var err error
	for attempt := 0; ; attempt++ {
		value, err = run()
		if !errors.Is(err, errors.Busy) || attempt == 2 {
			return value, err
		}
		if err = wait(int64(100 * (attempt + 1))); err != nil {
			return value, err
		}
	}
}
