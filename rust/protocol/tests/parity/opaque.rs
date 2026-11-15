use super::data::read;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::*;
use serde_json::{Value, json};

pub fn check(v: &Value) -> Result<Value> {
    let a = &v["input"];
    Ok(match v["name"].as_str().unwrap() {
        "opaqueMessage" => json!(opaque_message(
            a[0].as_str().unwrap(),
            a[1].as_u64().unwrap() as usize
        )?),
        "opaqueFinishLogin" => json!(opaque_finish_login(read(&a[0]))?),
        "opaqueServerFinishLogin" => json!(opaque_server_finish_login(read(&a[0]))?),
        "opaqueFinishRegistration" => {
            let r = opaque_finish_registration(read(&a[0]))?;
            assert_eq!(
                json!(r.server_static_public_key),
                v["result"]["serverStaticPublicKey"]
            );
            assert_eq!(
                opaque_message(&r.registration_record, 192)?,
                r.registration_record
            );
            v["result"].clone()
        }
        "opaqueRegistrationResponse" => {
            let p: ICreateServerRegistrationResponseParams = serde_json::from_value(a[0].clone())
                .map_err(|e| {
                EnvdenError::with_source(
                    ErrorCode::InvalidData,
                    "Missing OPAQUE user identifier",
                    e,
                )
            })?;
            json!(opaque_registration_response(p)?)
        }
        "opaqueServerStartLogin" => json!(opaque_server_start_login(read(&a[0]))?),
        _ => panic!("unknown opaque call"),
    })
}
