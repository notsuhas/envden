use crate::client::text;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain::IDeviceListState, protocol as p};
use serde_json::{Value, json};

pub fn encode_verified_state(
    state: &IDeviceListState,
    entries: &[p::ISigned<p::TEntry>],
) -> Result<Value> {
    let mut devices = vec![];
    let mut ever = vec![];
    let mut repairs = vec![];
    for signed in entries.iter().filter(|entry| entry.body.seq <= state.seq) {
        match &signed.body.change {
            p::TEntryPayload::Genesis(genesis) => {
                devices.push(genesis.device.id);
                ever.extend([genesis.device.id, genesis.recovery.id]);
            }
            p::TEntryPayload::AddDevice(add) => {
                devices.push(add.device.id);
                ever.push(add.device.id);
            }
            p::TEntryPayload::RemoveDevice(remove) => {
                devices.retain(|id| *id != remove.device);
                if let Some(recovery) = &remove.new_recovery {
                    ever.push(recovery.id);
                }
            }
            p::TEntryPayload::ReplaceRecovery(replace) => ever.push(replace.recovery.id),
            p::TEntryPayload::RepairDone(repair) => repairs.push(repair.repair_id),
            _ => {}
        }
    }
    if devices.len() != state.devices.len()
        || devices.iter().any(|id| !state.devices.contains_key(id))
        || ever.len() != state.ever_used_ids.len()
        || ever.iter().any(|id| !state.ever_used_ids.contains(id))
        || repairs.len() != state.repair_ids.len()
        || repairs.iter().any(|id| !state.repair_ids.contains(id))
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Missing device list history",
        ));
    }
    let devices: Vec<_> = devices
        .iter()
        .map(|id| json!([p::base32(id), device_value(&state.devices[id])]))
        .collect();
    let ever: Vec<_> = ever.iter().map(|id| p::base32(id)).collect();
    let repairs: Vec<_> = repairs.iter().map(|id| p::base32(id)).collect();
    let commits: Vec<_> = state
        .commits
        .iter()
        .map(|(epoch, key)| json!([epoch, bytes(key)]))
        .collect();
    Ok(
        json!({"vaultId":bytes(&state.vault_id),"seq":{"$bigint":state.seq.to_string()},"head":bytes(&state.head),"devices":{"$map":devices},"recovery":{"id":bytes(&state.recovery.id),"encPub":bytes(&state.recovery.enc_pub),"objPub":bytes(&state.recovery.obj_pub)},"epoch":state.epoch,"serverPin":bytes(&state.server_pin),"everUsedIds":{"$set":ever},"repairIds":{"$set":repairs},"commits":{"$map":commits}}),
    )
}

fn device_value(device: &p::IDeviceRecord) -> Value {
    json!({"id":bytes(&device.id),"name":device.name,"encPub":bytes(&device.enc_pub),"objPub":bytes(&device.obj_pub),"reqPub":bytes(&device.req_pub)})
}

fn bytes(value: &[u8]) -> Value {
    json!({"$bytes":text(value)})
}
