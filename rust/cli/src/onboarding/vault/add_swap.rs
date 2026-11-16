use crate::{identity::IDeviceIdentity, vault::history::IVaultHistory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};

pub(crate) fn add_swap(
    history: &IVaultHistory,
    mut device: p::IDeviceRecord,
    signing: ([u8; 16], &[u8; 32]),
    epoch_key: &[u8; 32],
    op: u8,
    identity: &IDeviceIdentity,
    now: u64,
) -> Result<p::ISwap> {
    let (signer, sk) = signing;
    let state = &history.state;
    device.name = crate::identity::name::unique_device_name(
        &device.name,
        state.devices.values().map(|v| v.name.as_str()),
    );
    let wrap = p::seal_wrap(
        epoch_key,
        &state.vault_id,
        state.epoch,
        &device.id,
        &device.enc_pub,
        &p::random_bytes(),
    )?;
    let entry = p::sign_object(
        p::TEntry {
            vault_id: state.vault_id,
            seq: state.seq + 1,
            parent: state.head,
            signer,
            change: p::TEntryPayload::AddDevice(p::IAddDevice { device, wrap }),
        },
        sk,
        "entry",
    )?;
    if !matches!(
        c::apply_entry(Some(state), &entry)?,
        c::TDeviceListResult::Valid { .. }
    ) {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Device name or keys cannot be added",
        ));
    }
    let before = history.headers.last().expect("verified history");
    let expected_head = p::object_hash(before, "manifest")?;
    let mut header = before.body.clone();
    header.seq += 1;
    header.prev = expected_head;
    header.op = op;
    header.list_seq = entry.body.seq;
    header.list_head = p::object_hash(&entry, "entry")?;
    header.created_at = now;
    header.signer = identity.record.id;
    Ok(p::ISwap {
        expected_head,
        entries: vec![entry],
        header: p::sign_object(header, &identity.keys.obj_sk, "manifest")?,
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters,
        client::retry_head,
        identity::device_identity,
        vault::{create_genesis, create_vault_swap},
    };

    #[test]
    fn retries_number_names_against_the_latest_list() {
        let root = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(root.path().join("home")), root.path().into(), || 42);
        let identity = device_identity(
            &*adapters.keychain,
            &adapters.home,
            "mainbook",
            false,
            &|| 42,
        )
        .unwrap();
        let genesis = create_genesis(&identity, [0; 32], 0).unwrap();
        let creation = create_vault_swap(
            &genesis,
            &identity,
            "password",
            &crate::client::text(&[0; 192]),
            1,
        )
        .unwrap();
        let entries = creation.swap.entries;
        let c::TDeviceListResult::Valid { state } = c::verify_chain(&entries).unwrap() else {
            panic!("chain")
        };
        let mut history = IVaultHistory {
            entries,
            headers: vec![creation.swap.header],
            states: [(state.seq, *state.clone())].into(),
            state: *state,
        };
        let other = create_adapters(Some(root.path().join("other")), root.path().into(), || 42);
        let candidate =
            device_identity(&*other.keychain, &other.home, "mainbook", false, &|| 42).unwrap();
        let proposed = crate::pairing::approval::named_for_list(candidate.record.clone(), &history);
        assert_eq!(proposed.name, "mainbook-2");
        let mut names = Vec::new();
        retry_head(|| {
            let swap = add_swap(
                &history,
                candidate.record.clone(),
                (identity.record.id, &identity.keys.obj_sk),
                &genesis.epoch_key,
                2,
                &identity,
                42,
            )?;
            let p::TEntryPayload::AddDevice(added) = &swap.entries[0].body.change else {
                panic!("add")
            };
            names.push(added.device.name.clone());
            if names.len() == 1 {
                let mut concurrent = added.device.clone();
                concurrent.id = [9; 16];
                history.state.devices.insert(concurrent.id, concurrent);
                return Err(EnvdenError::new(ErrorCode::HeadMoved, "Head moved"));
            }
            Ok(())
        })
        .unwrap();
        assert_eq!(names, ["mainbook-2", "mainbook-3"]);
    }
}
