use super::types::*;
pub(super) fn entry_bytes(entry: Option<&IEnvEntry>) -> Option<&[u8]> {
    entry.map(|e| {
        let raw = e.raw.as_slice();
        raw.strip_suffix(b"\r\n")
            .or_else(|| raw.strip_suffix(b"\n"))
            .unwrap_or(raw)
    })
}
pub fn select_entry<'a>(
    key: &str,
    original: Option<&'a IEnvEntry>,
    mine: Option<&'a IEnvEntry>,
    theirs: Option<&'a IEnvEntry>,
) -> Result<(bool, Option<&'a IEnvEntry>), TConflict> {
    let lc = entry_bytes(original) != entry_bytes(mine);
    let rc = entry_bytes(original) != entry_bytes(theirs);
    if lc && rc && entry_bytes(mine) == entry_bytes(theirs) {
        return Ok((true, mine));
    }
    let style = |entry: Option<&IEnvEntry>| {
        original
            .zip(entry)
            .is_some_and(|(a, b)| a.exported != b.exported || a.quote != b.quote)
    };
    let reason = if style(mine) || style(theirs) {
        Some("style-change")
    } else if lc && rc {
        if mine.is_none() || theirs.is_none() {
            Some("delete-vs-edit")
        } else if original
            .is_some_and(|o| o.active != mine.unwrap().active || o.active != theirs.unwrap().active)
        {
            Some("comment-toggle-vs-edit")
        } else {
            Some("both-changed")
        }
    } else {
        None
    };
    if let Some(reason) = reason {
        return Err(TConflict {
            reason,
            key: Some(key.to_owned()),
        });
    }
    Ok((lc || rc, if rc { theirs } else { mine }))
}
