package place

import (
	"context"
	"os"
	"path/filepath"
	"reflect"

	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
)

func PruneMissingCheckouts(ctx context.Context, home string, state *model.State, notice func(string), timing lock.Timing) error {
	return lock.WithStateLock(ctx, home, timing, func(ctx context.Context) error {
		approved := append([]model.Checkout{}, state.Approved...)
		for _, a := range approved {
			_, err := os.Lstat(a.Root)
			if err == nil {
				continue
			}

			if !os.IsNotExist(err) {
				return err
			}

			parent, err := os.Lstat(filepath.Dir(a.Root))
			if err != nil {
				continue
			}

			if a.RootDevice != nil {
				device, ok := deviceNumber(parent.Sys())
				if !ok || device != *a.RootDevice {
					continue
				}
			}

			removed, remaining := []model.Link{}, []model.Link{}
			for _, l := range state.Links {
				if l.Root == a.Root {
					removed = append(removed, l)
				} else {
					remaining = append(remaining, l)
				}
			}

			next := []model.Checkout{}
			for _, old := range state.Approved {
				if old.Root != a.Root {
					next = append(next, old)
				}
			}

			state.Approved = next
			if err := checkout.RemoveCheckoutBases(home, removed, remaining, timing.Now); err != nil {
				return err
			}

			if err := checkout.RemoveConflictTargets(home, a.Root, timing.Now); err != nil {
				return err
			}

			state.Links = remaining
			if notice != nil {
				notice("Missing checkout removed: " + a.Root)
			}
		}

		return store.SaveState(ctx, home, state, timing)
	})
}

func deviceNumber(value any) (int64, bool) {
	info := reflect.Indirect(reflect.ValueOf(value))
	if !info.IsValid() || info.Kind() != reflect.Struct {
		return 0, false
	}

	dev := info.FieldByName("Dev")
	if !dev.IsValid() {
		return 0, false
	}

	switch dev.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return dev.Int(), true
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return int64(dev.Uint()), true //nolint:gosec // Keep the OS device number bit pattern when converting to the stored signed representation.
	}

	return 0, false
}
