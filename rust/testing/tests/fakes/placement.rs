use envden_core::adapters::*;
use envden_testing::placement;
#[test]
fn placement_supported_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().supported("");
        }),
        "placement.supported",
    );
}

#[test]
fn placement_place_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().place("", "", None, None);
        }),
        "placement.place",
    );
}

#[test]
fn placement_remove_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().remove(None, "");
        }),
        "placement.remove",
    );
}

#[test]
fn placement_inspect_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = placement::IFakePlacementAdapter::default().inspect("", "");
        }),
        "placement.inspect",
    );
}
