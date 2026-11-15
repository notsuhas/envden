use super::suite::ICustomIdentifiers;
use crate::protocol::encoding::{base32, require_value};
use envden_core::errors::Result;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IOpaqueIdentifiers {
    pub user_identifier: String,
    pub identifiers: ICustomIdentifiers,
}

pub fn unlock_identifiers(vault: &[u8; 32]) -> IOpaqueIdentifiers {
    let id = base32(vault);
    IOpaqueIdentifiers {
        user_identifier: id.clone(),
        identifiers: ICustomIdentifiers {
            client: Some(format!("envden/v1/unlock/{id}")),
            server: Some("envden/v1/unlock-server".into()),
        },
    }
}

pub fn pairing_identifiers(pin: &[u8; 32], mailbox: u32) -> Result<IOpaqueIdentifiers> {
    require_value((1..=999).contains(&mailbox), "Invalid protocol data")?;
    Ok(IOpaqueIdentifiers {
        user_identifier: "envden/v1/pair".into(),
        identifiers: ICustomIdentifiers {
            client: Some("envden/v1/pair/joiner".into()),
            server: Some(format!("envden/v1/pair/{}/{mailbox}", base32(pin))),
        },
    })
}
