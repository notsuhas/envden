use envden_protocol::protocol::base32;
use sha2::{Digest, Sha256};

pub fn content_hash(bytes: Option<&[u8]>) -> Option<String> {
    bytes.map(|b| base32(&Sha256::digest(b)))
}

pub fn can_resume(
    before: &[Option<String>],
    current: &[Option<String>],
    next: Option<&str>,
    written: &[bool],
) -> bool {
    before.len() == current.len()
        && current.iter().enumerate().all(|(i, hash)| {
            hash.as_deref() == next
                || (!written.get(i).copied().unwrap_or(false) && hash == &before[i])
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn written_places_cannot_revert() {
        let before = vec![Some("a".into()), None];
        assert!(can_resume(&before, &before, Some("b"), &[false, false]));
        assert!(!can_resume(&before, &before, Some("b"), &[true, false]));
        assert!(can_resume(
            &before,
            &[Some("b".into()), None],
            Some("b"),
            &[true, false]
        ));
        assert!(!can_resume(&before, &[], None, &[]));
    }
}
