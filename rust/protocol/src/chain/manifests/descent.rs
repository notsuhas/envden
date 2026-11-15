use super::{
    signature::check_header_signature,
    source::{IChainSource, needed, source_value},
};
use crate::{chain::devices::IDeviceListState, protocol::*};
use envden_core::errors::Result;

pub fn entry_descent(
    source: &impl IChainSource,
    seq: u64,
    head: &[u8; 32],
    target: &IManifestHeader,
) -> Result<Vec<ISigned<TEntry>>> {
    let mut path = vec![];
    let mut hash = target.list_head;
    let mut current = target.list_seq;
    require_value(current >= seq, "Invalid chain data")?;
    while current > seq {
        let e = needed(source_value(source.entry(&hash))?)?;
        require_value(
            e.body.seq == current && object_hash(&e, "entry")? == hash,
            "Invalid chain data",
        )?;
        hash = e.body.parent;
        current -= 1;
        path.push(e);
    }
    require_value(hash == *head, "Invalid chain data")?;
    path.reverse();
    Ok(path)
}

pub fn header_descent(
    source: &impl IChainSource,
    ancestor: &ISigned<IManifestHeader>,
    head: &ISigned<IManifestHeader>,
    verified: &IDeviceListState,
) -> Result<Option<Vec<ISigned<IManifestHeader>>>> {
    let mut path = vec![];
    let mut current = head.clone();
    while current.body.seq > ancestor.body.seq {
        let previous = needed(source_value(source.header(&current.body.prev))?)?;
        require_value(
            object_hash(&previous, "manifest")? == current.body.prev
                && Some(current.body.seq) == previous.body.seq.checked_add(1),
            "Invalid chain data",
        )?;
        path.push(current);
        current = previous;
    }
    if object_hash(&current, "manifest")? != object_hash(ancestor, "manifest")? {
        check_header_signature(source, verified, &current)?;
        for h in path {
            check_header_signature(source, verified, &h)?;
        }
        return Ok(None);
    }
    path.reverse();
    Ok(Some(path))
}
