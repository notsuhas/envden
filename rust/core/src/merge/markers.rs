use super::{
    engine::{entry, keys, parse_sides},
    layout::{assemble, layout_changed, line_ending, with_line_ending},
    selection::select_entry,
};
use std::collections::BTreeMap;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ILabels {
    pub mine: String,
    pub theirs: String,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TMarked {
    Keys { bytes: Vec<u8>, keys: Vec<String> },
    File { bytes: Vec<u8> },
}
pub fn has_conflict_markers(bytes: &[u8]) -> bool {
    bytes.split(|&b| b == 10 || b == 13).any(|line| {
        [b"<<<<<<<", b"=======", b">>>>>>>"].iter().any(|m| {
            line.starts_with(*m)
                && (line.len() == 7 || super::parser::whitespace(char::from(line[7])))
        })
    })
}
fn block(mine: &[u8], theirs: &[u8], labels: &ILabels, ending: &[u8]) -> Vec<u8> {
    let clean = |s: &str| {
        let mut out = String::new();
        let mut newline = false;
        for c in s.chars() {
            if c == '\r' || c == '\n' {
                if !newline {
                    out.push(' ');
                }
                newline = true;
            } else {
                newline = false;
                out.push(c);
            }
        }
        out
    };
    let mut out = format!("<<<<<<< {}", clean(&labels.mine)).into_bytes();
    out.extend_from_slice(ending);
    for (part, label) in [
        (mine, "=======".to_owned()),
        (theirs, format!(">>>>>>> {}", clean(&labels.theirs))),
    ] {
        out.extend_from_slice(part);
        if !part.is_empty() && part.last() != Some(&10) {
            out.extend_from_slice(ending);
        }
        out.extend_from_slice(label.as_bytes());
        out.extend_from_slice(ending);
    }
    out
}
pub fn mark_conflicts(
    base: Option<&[u8]>,
    local: &[u8],
    remote: &[u8],
    labels: &ILabels,
) -> TMarked {
    let ending = line_ending(&[local, remote]);
    if let Some(files) = base
        .and_then(|b| parse_sides(b, local, remote).ok())
        .filter(|f| !layout_changed(f))
    {
        let mut selected = BTreeMap::new();
        let mut blocks = Vec::new();
        for key in keys(&files) {
            let l = entry(&files[1], &key);
            let r = entry(&files[2], &key);
            match select_entry(&key, entry(&files[0], &key), l, r) {
                Err(_) => blocks.push((
                    key,
                    block(
                        l.map(|e| e.raw.as_slice()).unwrap_or_default(),
                        &r.map(|e| with_line_ending(&e.raw, ending))
                            .unwrap_or_default(),
                        labels,
                        ending,
                    ),
                )),
                Ok((_, Some(e))) => {
                    selected.insert(key, e.clone());
                }
                _ => {}
            }
        }
        if !blocks.is_empty() {
            return TMarked::Keys {
                bytes: assemble(&files, &selected, ending, &blocks),
                keys: blocks.into_iter().map(|(k, _)| k).collect(),
            };
        }
    }
    TMarked::File {
        bytes: block(local, remote, labels, ending),
    }
}
