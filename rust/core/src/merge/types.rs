#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IEnvEntry {
    pub key: String,
    pub raw: Vec<u8>,
    pub exported: bool,
    pub quote: String,
    pub active: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TConflict {
    pub reason: &'static str,
    pub key: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IParsedEnv {
    pub head: Vec<u8>,
    pub entries: Vec<IEnvEntry>,
    pub tail: Vec<u8>,
}
pub type TParseResult = Result<IParsedEnv, TConflict>;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ICleanMerge {
    pub bytes: Vec<u8>,
    pub changed_keys: Vec<String>,
}
pub type TMergeResult = Result<ICleanMerge, TConflict>;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IEnvDiff {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub changed: Vec<String>,
}
