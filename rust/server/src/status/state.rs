#[derive(Debug)]
pub struct IStatusState {
    pub enabled: bool,
    pub started_at: u64,
    pub last_prune: Option<(u64, bool)>,
    pub(crate) window: Option<(u64, usize)>,
}

impl IStatusState {
    pub fn new(started_at: u64, setting: Option<&str>) -> Self {
        Self {
            enabled: setting != Some("off"),
            started_at,
            last_prune: None,
            window: None,
        }
    }
}
