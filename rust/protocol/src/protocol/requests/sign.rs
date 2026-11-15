use crate::protocol::*;
use envden_core::errors::Result;
use sha2::{Digest, Sha256};

#[derive(Debug, PartialEq, Eq)]
pub enum TVerification<T> {
    Valid(T),
    Invalid { reason: &'static str },
}

pub fn sign_request(request: IRequest, secret: &[u8; 32]) -> Result<ISigned<IRequest>> {
    sign_object(request, secret, "request")
}

pub fn verify_request<'a>(
    v: &'a ISigned<IRequest>,
    public: &[u8; 32],
    pin: &[u8; 32],
    body: &[u8],
    now: u64,
    nonce_seen: bool,
) -> TVerification<&'a IRequest> {
    verify_request_hash(
        v,
        public,
        pin,
        &Sha256::digest(body).into(),
        now,
        nonce_seen,
    )
}

pub fn verify_request_hash<'a>(
    v: &'a ISigned<IRequest>,
    public: &[u8; 32],
    pin: &[u8; 32],
    body_hash: &[u8; 32],
    now: u64,
    nonce_seen: bool,
) -> TVerification<&'a IRequest> {
    if v.body.server_pin != *pin || v.body.body_hash != *body_hash {
        return TVerification::Invalid {
            reason: "Request binding mismatch",
        };
    }
    if (i128::from(v.body.time) - i128::from(now)).abs() >= 300000 || nonce_seen {
        return TVerification::Invalid {
            reason: "Expired or replayed request",
        };
    }
    if encode(&v.body).is_err() {
        return TVerification::Invalid {
            reason: "Malformed signed object",
        };
    }

    if verify_object(v, public, "request") {
        TVerification::Valid(&v.body)
    } else {
        TVerification::Invalid {
            reason: "Invalid signature",
        }
    }
}
