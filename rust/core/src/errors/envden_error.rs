use std::borrow::Cow;
use std::error::Error as StdError;

use super::code::ErrorCode;

type TSource = Box<dyn StdError + Send + Sync + 'static>;

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct EnvdenError {
    pub code: ErrorCode,
    pub message: Cow<'static, str>,
    #[source]
    pub source: Option<TSource>,
}

pub type Result<T, E = EnvdenError> = std::result::Result<T, E>;

impl EnvdenError {
    pub fn new(code: ErrorCode, message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            code,
            message: message.into(),
            source: None,
        }
    }

    pub fn with_source(
        code: ErrorCode,
        message: impl Into<Cow<'static, str>>,
        source: impl Into<TSource>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            source: Some(source.into()),
        }
    }
}
