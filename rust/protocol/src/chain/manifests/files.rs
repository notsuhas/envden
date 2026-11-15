use crate::protocol::*;
use envden_core::errors::Result;

pub fn checked_files(files: Option<&IFiles>, hash: &[u8; 32]) -> Result<IFiles> {
    let f = files.ok_or_else(|| {
        envden_core::errors::EnvdenError::new(
            envden_core::errors::ErrorCode::InvalidData,
            "Invalid chain data",
        )
    })?;
    require_value(h("files", &encode(f)?) == *hash, "Invalid chain data")?;
    Ok(f.clone())
}

pub fn changed_files(
    before: &IFiles,
    after: &IFiles,
    minimum_epoch: u32,
    epoch: u32,
    op: Option<u8>,
) -> Result<Vec<IFileEntry>> {
    encode(before)?;
    encode(after)?;
    require_value(
        before
            .entries
            .iter()
            .all(|e| after.entries.iter().any(|n| n.file_id == e.file_id)),
        "Invalid chain data",
    )?;
    let mut changes = vec![];
    for e in &after.entries {
        let prev = before.entries.iter().find(|p| p.file_id == e.file_id);
        if prev == Some(e) {
            continue;
        }
        require_value(
            prev.is_none_or(|p| e.version > p.version && e.name != p.name),
            "Invalid chain data",
        )?;
        require_value(
            e.epoch >= minimum_epoch && e.epoch <= epoch,
            "Invalid chain data",
        )?;
        if let Some(op) = op {
            require_value(e.epoch == epoch, "Invalid chain data")?;
            require_value(
                if op == 11 {
                    prev.is_some_and(|p| [1, 3].contains(&p.state)) && [3, 4].contains(&e.state)
                } else {
                    [1, 2].contains(&e.state)
                },
                "Invalid chain data",
            )?;
        }
        changes.push(e.clone());
    }
    Ok(changes)
}
