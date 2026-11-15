use crate::errors::Result;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct INetworkProblem {
    pub kind: TNetworkProblemKind,
    pub message: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TNetworkProblemKind {
    NotInstalled,
    NotRunning,
    LoggedOut,
    HttpsDisabled,
    Unreadable,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum THttpsCheck {
    Ready,
    Problem(INetworkProblem),
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct INetworkStatus {
    pub ready: bool,
    pub running: bool,
    pub logged_in: bool,
    pub https_enabled: bool,
    pub hostname: Option<String>,
    pub problem: Option<INetworkProblem>,
}
pub trait INetworkAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn check_https_certificate(&self) -> Result<THttpsCheck>;
    fn status(&self) -> Result<INetworkStatus>;
    fn expose(&self, port: f64) -> Result<String>;
}
