use crate::protocol::*;
use std::collections::BTreeMap;

pub fn index_headers(
    headers: &[ISigned<IManifestHeader>],
) -> BTreeMap<u64, ISigned<IManifestHeader>> {
    let mut result = BTreeMap::new();
    for h in headers {
        result.entry(h.body.seq).or_insert_with(|| h.clone());
    }
    result
}
