mod support;
use envden_protocol::{chain::*, protocol::*};
use support::*;
fn next_header(
    previous: &ISigned<IManifestHeader>,
    s: &IDeviceListState,
    op: u8,
) -> ISigned<IManifestHeader> {
    let mut h = previous.body.clone();
    h.seq += 1;
    h.prev = object_hash(previous, "manifest").unwrap();
    h.list_seq = s.seq;
    h.list_head = s.head;
    h.epoch = s.epoch;
    h.op = op;
    sign_object(h, &[1; 32], "manifest").unwrap()
}
#[test]
fn member_removal_rollback_repair_drop_and_fork() {
    let (s, g, e) = fixture();
    let (a, key) = device(1);
    let (b, _) = device(2);
    let base = header(&s, &IFiles { entries: vec![] });
    let add = entry(
        &s,
        TEntryPayload::AddDevice(IAddDevice {
            device: b.clone(),
            wrap: IWrap {
                recipient: b.id,
                enc: [1; 32],
                ct: vec![2; 48],
            },
        }),
        &a,
        &key,
    );
    let joined_state = apply(Some(&s), &add).unwrap();
    let joined = next_header(&base, &joined_state, 2);
    let mut change = change(&joined_state);
    change.wraps.retain(|w| w.recipient != b.id);
    let remove = entry(
        &joined_state,
        TEntryPayload::RemoveDevice(IRemoveDevice {
            device: b.id,
            new_recovery: None,
            change,
        }),
        &a,
        &key,
    );
    let removed = apply(Some(&joined_state), &remove).unwrap();
    let removal = next_header(&joined, &removed, 4);
    let stored_headers = vec![base.clone(), joined.clone()];
    let stored_entries = vec![g, e, add.clone()];
    let verified_headers = vec![base.clone(), joined.clone(), removal];
    let verified_entries = vec![add, remove];
    let i = INonMemberInput {
        device_id: b.id,
        stored_headers: &stored_headers,
        stored_entries: &stored_entries,
        verified_headers: &verified_headers,
        verified_entries: &verified_entries,
        state: &removed,
    };
    assert!(matches!(
        classify_non_member(i).unwrap(),
        TNonMember::Removed { .. }
    ));
    let base_only = std::slice::from_ref(&base);
    assert!(matches!(
        classify_non_member(INonMemberInput {
            device_id: b.id,
            stored_headers: &stored_headers,
            stored_entries: &stored_entries,
            verified_headers: base_only,
            verified_entries: &[],
            state: &s
        })
        .unwrap(),
        TNonMember::Rollback
    ));
    let done = entry(
        &s,
        TEntryPayload::RepairDone(IRepairDone {
            repair_id: [4; 32],
            restored_head: object_hash(&base, "manifest").unwrap(),
        }),
        &a,
        &key,
    );
    let repaired = apply(Some(&s), &done).unwrap();
    let repaired_header = next_header(&base, &repaired, 12);
    let branch_headers = [base, repaired_header];
    let branch_entries = [done];
    let input = |device_id, state| INonMemberInput {
        device_id,
        stored_headers: &stored_headers,
        stored_entries: &stored_entries,
        verified_headers: &branch_headers,
        verified_entries: &branch_entries,
        state,
    };
    assert!(matches!(
        classify_non_member(input(b.id, &s)).unwrap(),
        TNonMember::DroppedByRepair
    ));
    assert!(matches!(
        classify_non_member(input(a.id, &s)).unwrap(),
        TNonMember::Fork
    ));
}
