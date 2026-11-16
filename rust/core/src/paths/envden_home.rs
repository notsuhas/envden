use std::{ffi::OsString, path::PathBuf};

// An empty ENVDEN_HOME is unset, so envden falls back to ~/.envden instead of the working directory.
pub fn envden_home_override(value: Option<OsString>) -> Option<PathBuf> {
    value.filter(|value| !value.is_empty()).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_value_is_unset() {
        assert_eq!(envden_home_override(None), None);
        assert_eq!(envden_home_override(Some("".into())), None);
        assert_eq!(
            envden_home_override(Some("/config".into())),
            Some(PathBuf::from("/config"))
        );
    }
}
