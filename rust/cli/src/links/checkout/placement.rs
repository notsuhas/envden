use crate::adapters::IAdapters;
use envden_core::{
    adapters::IPlacementAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};

pub fn place_file(
    adapters: &IAdapters,
    placement: &dyn IPlacementAdapter,
    root: &str,
    store: &str,
    destination: &str,
    replacing_link: Option<&str>,
) -> Result<()> {
    let prepare = |path: &str| {
        let checkout = adapters
            .repo
            .checkout_at(root)?
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Checkout is unavailable"))?;
        adapters.repo.ensure_ignored(&checkout, path)
    };
    placement.place(store, destination, Some(&prepare), replacing_link)
}
