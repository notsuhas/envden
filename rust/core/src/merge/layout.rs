use super::{
    parser::{latin1, whitespace},
    types::*,
};
use std::collections::{BTreeMap, BTreeSet};
pub(super) fn line_ending(files: &[&[u8]]) -> &'static [u8] {
    for file in files {
        if let Some(i) = file.iter().position(|&b| b == 10) {
            return if i > 0 && file[i - 1] == 13 {
                b"\r\n"
            } else {
                b"\n"
            };
        }
    }
    b"\n"
}
pub(super) fn with_line_ending(raw: &[u8], ending: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    for &b in raw {
        if b == 10 {
            if out.last() == Some(&13) {
                out.pop();
            }
            out.extend_from_slice(ending);
        } else {
            out.push(b);
        }
    }
    out
}
fn owners(entries: &[IEnvEntry]) -> BTreeMap<String, BTreeSet<String>> {
    let mut owners = BTreeMap::<String, BTreeSet<String>>::new();
    for entry in entries {
        let text = latin1(&entry.raw);
        let mut lines: Vec<&str> = text
            .split('\n')
            .map(|l| l.strip_suffix('\r').unwrap_or(l))
            .collect();
        if lines.last() == Some(&"") {
            lines.pop();
        }
        lines.pop();
        let block = lines
            .into_iter()
            .filter(|l| !l.trim_matches(whitespace).is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if !block.is_empty() {
            owners.entry(block).or_default().insert(entry.key.clone());
        }
    }
    owners
}
pub(super) fn layout_changed(files: &[IParsedEnv; 3]) -> bool {
    let [b, l, r] = files;
    let bo = owners(&b.entries);
    let lo = owners(&l.entries);
    let ro = owners(&r.entries);
    for (block, keys) in bo {
        if let (Some(mine), Some(theirs)) = (lo.get(&block), ro.get(&block)) {
            for key in keys {
                if !mine.contains(&key)
                    && !theirs.contains(&key)
                    && mine.iter().any(|k| !theirs.contains(k))
                {
                    return true;
                }
            }
        }
    }
    (!b.tail.is_empty() && b.tail != l.tail && b.tail != r.tail)
        || (b.tail != r.tail && l.tail != r.tail)
}
fn append(out: &mut Vec<u8>, part: &[u8], ending: &[u8], has_part: &mut bool) {
    if part.is_empty() {
        return;
    }
    if *has_part && out.last() != Some(&10) {
        out.extend_from_slice(ending);
    }
    out.extend_from_slice(part);
    *has_part = true;
}
pub(super) fn assemble(
    files: &[IParsedEnv; 3],
    selected: &BTreeMap<String, IEnvEntry>,
    ending: &[u8],
    blocks: &[(String, Vec<u8>)],
) -> Vec<u8> {
    let [b, l, r] = files;
    let mut out = if b.head == l.head {
        r.head.clone()
    } else {
        l.head.clone()
    };
    let mut has_part = false;
    for e in &l.entries {
        if let Some(block) = blocks
            .iter()
            .find(|(k, _)| *k == e.key)
            .map(|(_, b)| b.as_slice())
        {
            append(
                &mut out,
                &with_line_ending(block, ending),
                ending,
                &mut has_part,
            );
        } else if let Some(chosen) = selected.get(&e.key) {
            let raw = if std::ptr::eq(chosen, e) || chosen.raw == e.raw {
                chosen.raw.clone()
            } else {
                with_line_ending(&chosen.raw, ending)
            };
            append(&mut out, &raw, ending, &mut has_part);
        }
    }
    append(&mut out, &l.tail, ending, &mut has_part);
    for e in &r.entries {
        if !b.entries.iter().chain(&l.entries).any(|k| k.key == e.key) {
            append(
                &mut out,
                &with_line_ending(&e.raw, ending),
                ending,
                &mut has_part,
            );
        }
    }
    for (key, block) in blocks {
        if !l.entries.iter().any(|e| e.key == *key) {
            append(&mut out, block, ending, &mut has_part);
        }
    }
    out
}
