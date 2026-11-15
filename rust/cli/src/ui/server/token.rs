use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};

pub fn new_token() -> String {
    URL_SAFE_NO_PAD.encode(envden_protocol::protocol::random_bytes::<32>())
}

pub fn token_matches(authorization: Option<&str>, token: &str) -> bool {
    let presented = authorization
        .and_then(|a| a.strip_prefix("Bearer "))
        .unwrap_or("");
    use subtle::ConstantTimeEq;
    bool::from(presented.as_bytes().ct_eq(token.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_bearer_and_fresh_random_token() {
        let token = new_token();
        assert_eq!(token.len(), 43);
        assert_ne!(token, new_token());
        assert!(token_matches(Some(&format!("Bearer {token}")), &token));
        for value in [None, Some("bearer token"), Some("Bearer wrong")] {
            assert!(!token_matches(value, &token));
        }
    }
}
