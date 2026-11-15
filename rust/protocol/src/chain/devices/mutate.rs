use super::state::IDeviceListState;
use crate::protocol::*;
use TEntryPayload::*;
use envden_core::errors::Result;

fn check(b: bool) -> Result<()> {
    require_value(b, "Invalid chain data")
}

pub fn transition(s: &mut IDeviceListState, e: &TEntry) -> Result<()> {
    match &e.change {
        Genesis(_) => check(false)?,
        AddDevice(p) => {
            let d = &p.device;
            check(!s.ever_used_ids.contains(&d.id) && s.devices.len() < 64 && s.epoch >= 1)?;
            check(!s.devices.values().any(|v| v.name == d.name) && p.wrap.recipient == d.id)?;
            s.devices.insert(d.id, d.clone());
            s.ever_used_ids.insert(d.id);
        }
        RemoveDevice(p) => {
            check(
                s.devices.contains_key(&p.device) && s.devices.len() > 1 && e.signer != p.device,
            )?;
            s.devices.remove(&p.device);
            if let Some(r) = &p.new_recovery {
                s.recovery = r.clone();
            }
        }
        NewEpoch(_) => {}
        ReplaceRecovery(p) => s.recovery = p.recovery.clone(),
        ServerMoved(p) => {
            check(p.old_pin == s.server_pin)?;
            s.server_pin = p.new_pin;
        }
        RepairDone(p) => check(s.repair_ids.insert(p.repair_id))?,
        RenameDevice(p) => {
            check(s.devices.contains_key(&p.device) && e.signer == p.device)?;
            check(!s.devices.values().any(|v| v.name == p.name))?;
            s.devices.get_mut(&p.device).expect("checked member").name = p.name.clone();
        }
    }
    Ok(())
}
