use envden_core::errors::EnvdenError;
use std::error::Error;

pub struct IFailure {
    pub code: String,
    pub message: String,
    pub causes: Vec<String>,
    pub stack: Option<String>,
}

pub fn describe_failure(error: &EnvdenError) -> IFailure {
    let mut causes = Vec::new();
    let mut source = error.source();
    while let Some(cause) = source {
        if causes.len() == 5 {
            break;
        }
        causes.push(cause.to_string());
        source = cause.source();
    }
    IFailure {
        code: error.code.as_str().into(),
        message: error.message.to_string(),
        causes,
        stack: None,
    }
}
