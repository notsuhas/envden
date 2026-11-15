use super::persist::{io_error, persist_identity, restrict};
use crate::http::{
    encoding::{binary, text},
    types::IServerKeys,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::{
    generate_recovery_keys, opaque_create_setup, opaque_message, random_bytes,
};
use serde_json::Value;
use std::{fs, path::Path};

pub fn load_server_keys(directory: &Path) -> Result<IServerKeys> {
    fs::create_dir_all(directory).map_err(io_error)?;
    restrict(directory, true)?;
    let path = directory.join("identity.json");
    match fs::read(&path) {
        Ok(bytes) => {
            let data: Value = serde_json::from_slice(&bytes)
                .map_err(|_| EnvdenError::new(ErrorCode::InvalidData, "Invalid server identity"))?;
            restrict(&path, false)?;
            let field = |name| {
                data.get(name).and_then(Value::as_str).ok_or_else(|| {
                    EnvdenError::new(ErrorCode::InvalidData, "Invalid server identity")
                })
            };
            let secret_key: [u8; 32] = binary(field("secretKey")?, Some(32))?
                .try_into()
                .expect("checked length");
            let public_key: [u8; 32] = binary(field("publicKey")?, Some(32))?
                .try_into()
                .expect("checked length");
            if generate_recovery_keys(|| secret_key).obj_pub != public_key {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Invalid server identity",
                ));
            }
            let opaque_setup = opaque_message(field("opaqueSetup")?, 128)?.to_owned();

            Ok(IServerKeys {
                secret_key,
                public_key,
                opaque_setup,
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let keys = generate_recovery_keys(random_bytes);
            let opaque_setup = opaque_create_setup();
            let data = format!(
                "{{\"secretKey\":\"{}\",\"publicKey\":\"{}\",\"opaqueSetup\":\"{}\"}}",
                text(&keys.obj_sk),
                text(&keys.obj_pub),
                opaque_setup
            );
            persist_identity(directory, data.as_bytes())?;
            restrict(&path, false)?;

            Ok(IServerKeys {
                secret_key: keys.obj_sk,
                public_key: keys.obj_pub,
                opaque_setup,
            })
        }
        Err(error) => Err(io_error(error)),
    }
}
