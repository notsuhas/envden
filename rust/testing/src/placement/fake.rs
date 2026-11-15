use envden_core::{adapters::*, errors::Result};
pub type TSupported = Box<dyn Fn(&str) -> Result<bool> + Send + Sync>;
pub type TPlace = Box<
    dyn Fn(&str, &str, Option<TPrepareTemporary<'_>>, Option<&str>) -> Result<()> + Send + Sync,
>;
pub type TRemove = Box<dyn Fn(Option<&str>, &str) -> Result<()> + Send + Sync>;
pub type TInspect = Box<dyn Fn(&str, &str) -> Result<TPlacementState> + Send + Sync>;
pub struct IFakePlacementAdapter {
    pub mode: TPlacementMode,
    pub supported: Option<TSupported>,
    pub place: Option<TPlace>,
    pub remove: Option<TRemove>,
    pub inspect: Option<TInspect>,
}
impl Default for IFakePlacementAdapter {
    fn default() -> Self {
        Self {
            mode: TPlacementMode::Copy,
            supported: None,
            place: None,
            remove: None,
            inspect: None,
        }
    }
}
impl IPlacementAdapter for IFakePlacementAdapter {
    fn mode(&self) -> TPlacementMode {
        self.mode
    }
    fn supported(&self, dir: &str) -> Result<bool> {
        self.supported
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: placement.supported"))(dir)
    }
    fn place(
        &self,
        store_path: &str,
        checkout_path: &str,
        prepare_temporary: Option<TPrepareTemporary<'_>>,
        replacing_link: Option<&str>,
    ) -> Result<()> {
        self.place
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: placement.place"))(
            store_path,
            checkout_path,
            prepare_temporary,
            replacing_link,
        )
    }
    fn remove(&self, store_path: Option<&str>, checkout_path: &str) -> Result<()> {
        self.remove
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: placement.remove"))(
            store_path,
            checkout_path,
        )
    }
    fn inspect(&self, store_path: &str, checkout_path: &str) -> Result<TPlacementState> {
        self.inspect
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: placement.inspect"))(
            store_path,
            checkout_path,
        )
    }
}
