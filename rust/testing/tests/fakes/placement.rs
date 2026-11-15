use envden_core::adapters::*;
use envden_testing::placement;
#[test]
fn placement_supported_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().supported("");
        })
        .is_err()
    );
}

#[test]
fn placement_place_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().place("", "", None, None);
        })
        .is_err()
    );
}

#[test]
fn placement_remove_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().remove(None, "");
        })
        .is_err()
    );
}

#[test]
fn placement_inspect_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().inspect("", "");
        })
        .is_err()
    );
}
