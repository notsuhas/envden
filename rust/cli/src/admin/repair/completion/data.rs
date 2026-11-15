use super::super::context::invalid;
use crate::{
    admin::shared::{context::IAdminContext, transfer::optional_object},
    client::{binary, text},
    vault::{admin::material::current_material, history::IVaultHistory},
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::collections::BTreeSet;

pub fn objects(context: &IAdminContext<'_>, path: &str) -> Result<Vec<String>> {
    let response: p::IObjectsResponse =
        serde_json::from_value(context.client.request(path, "GET", None)?.json()?)
            .map_err(|_| invalid(ErrorCode::InvalidData, "Invalid server response"))?;
    Ok(response.objects)
}

pub fn reports(
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    id: &[u8; 32],
) -> Result<Vec<p::ISigned<p::IRepairReport>>> {
    let members = history
        .state
        .devices
        .values()
        .map(|d| (d.id, d.obj_pub))
        .collect::<Vec<_>>();
    let mut reports = Vec::new();
    for encoded in objects(context, "/v1/repair/reports")? {
        let bytes = binary(&encoded)?;
        let input = c::IUnknownData {
            received: &bytes,
            stored: None,
            mismatch: c::TUnknownData::Fork,
            unknown_format: false,
            current_version: crate::version::VERSION,
            latest_version: context.local["latest"]
                .as_str()
                .unwrap_or(crate::version::VERSION),
        };
        match c::decode_server_object::<p::IRepairReport>(input, &members, "repair-report")? {
            c::TServerObject::Known { value } => reports.push(value),
            c::TServerObject::Unknown(c::TUnknownData::UpdateRequired) => {
                return Err(invalid(
                    ErrorCode::UpdateRequired,
                    "Update envden to read server data",
                ));
            }
            c::TServerObject::Unknown(c::TUnknownData::Unreadable) => {
                return Err(invalid(
                    ErrorCode::InvalidData,
                    "Unreadable data from server",
                ));
            }
            _ => {}
        }
    }
    let hashes = history
        .headers
        .iter()
        .map(|h| p::object_hash(h, "manifest"))
        .collect::<Result<BTreeSet<_>>>()?;
    Ok(c::filter_repair_reports(
        &reports,
        id,
        &history.state,
        &hashes,
    ))
}

pub fn available(context: &IAdminContext<'_>) -> Result<BTreeSet<[u8; 32]>> {
    let mut available = BTreeSet::new();
    for hash in objects(context, "/v1/blobs")? {
        if let Some(bytes) = optional_object(&context.client, &format!("/v1/blobs/{hash}"))? {
            let hash = p::fixed(&binary(&hash)?)?;
            if p::h("blob", &bytes) != hash {
                return Err(invalid(ErrorCode::InvalidData, "Repair blob hash mismatch"));
            }
            available.insert(hash);
        }
    }
    Ok(available)
}

pub fn files(context: &IAdminContext<'_>, history: &IVaultHistory) -> Result<p::IFiles> {
    let hash = history.headers.last().expect("history").body.files_hash;
    let bytes = context
        .client
        .request(&format!("/v1/files/{}", text(&hash)), "GET", None)?
        .body;
    if p::h("files", &bytes) != hash {
        return Err(invalid(
            ErrorCode::InvalidData,
            "Repair file list hash mismatch",
        ));
    }
    p::decode(&bytes)
}

pub fn names(
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    entries: &[p::IFileEntry],
) -> Result<Vec<p::IFileName>> {
    let material = current_material(context, history)?;
    entries
        .iter()
        .map(|e| {
            p::open_file_name(
                &e.name,
                material
                    .keys
                    .get(&e.epoch)
                    .ok_or_else(|| invalid(ErrorCode::InvalidData, "Missing epoch key"))?,
                &material.ring.id_key,
                &p::IFileContext {
                    vault_id: context.vault_id,
                    epoch: e.epoch,
                    file_id: e.file_id,
                    version: e.version,
                },
            )
        })
        .collect()
}
