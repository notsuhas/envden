use crate::protocol::*;
use envden_core::errors::Result;

pub fn build_hello(body: IServerHello, secret: &[u8; 32]) -> Result<ISigned<IServerHello>> {
    sign_object(body, secret, "server-hello")
}

pub fn verify_hello<'a>(
    v: &'a ISigned<IServerHello>,
    challenge: &[u8; 32],
    host: &str,
    pin: &[u8; 32],
    min_server: &str,
) -> TVerification<&'a IServerHello> {
    let check = || -> Result<TVerification<&IServerHello>> {
        let b = &v.body;
        if b.challenge != *challenge
            || b.host != host.to_lowercase()
            || server_pin(&b.server_sign_pub)? != *pin
            || compare_semver(&b.app_version, min_server)?.is_lt()
        {
            return Ok(TVerification::Invalid {
                reason: "Hello binding or version mismatch",
            });
        }
        if encode(b).is_err() {
            return Ok(TVerification::Invalid {
                reason: "Malformed signed object",
            });
        }
        Ok(if verify_object(v, &b.server_sign_pub, "server-hello") {
            TVerification::Valid(b)
        } else {
            TVerification::Invalid {
                reason: "Invalid signature",
            }
        })
    };
    check().unwrap_or(TVerification::Invalid {
        reason: "Invalid hello",
    })
}
