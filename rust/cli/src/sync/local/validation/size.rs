pub fn file_size_notice(path: &str, bytes: Option<&[u8]>) -> Option<String> {
    bytes.filter(|b| b.len() > 1_048_576).map(|_| {
        crate::output::sanitize_terminal(&format!(
            "Skipped oversized env file: {path} exceeds 1 MiB"
        ))
    })
}
