use super::select::IHistoryTarget;
use crate::{adapters::IAdapters, sync::local::files::read_bytes};
use envden_core::errors::Result;
use std::path::Path;

pub struct ICheckoutBytes {
    pub bytes: Option<Vec<u8>>,
    pub detached: bool,
}

pub fn checkout_bytes(adapters: &IAdapters, target: &IHistoryTarget) -> Result<ICheckoutBytes> {
    let destination = Path::new(&target.root).join(&target.path);
    let Some(link) = target.link.as_ref().filter(|link| link["mode"] == "link") else {
        return Ok(ICheckoutBytes {
            bytes: read_bytes(&destination)?,
            detached: false,
        });
    };
    let store = link["store"].as_str().unwrap_or_default();
    let status = adapters
        .placement(
            envden_core::adapters::TPlacementMode::Link,
            Path::new(&target.root),
        )
        .inspect(store, &destination.to_string_lossy())?;
    let stored = read_bytes(Path::new(store))?;
    if status != envden_core::adapters::TPlacementState::Detached {
        return Ok(ICheckoutBytes {
            bytes: stored,
            detached: false,
        });
    }
    let placed = read_bytes(&destination)?;
    Ok(ICheckoutBytes {
        detached: placed != stored,
        bytes: placed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn detached_history_reads_placed_bytes_and_equal_bytes_are_not_detached() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().join("home")),
            dir.path().to_owned(),
            || 1,
        );
        let store = dir.path().join("store");
        let destination = dir.path().join(".env");
        std::fs::write(&store, b"A=1").unwrap();
        let target = IHistoryTarget {
            root: dir.path().to_string_lossy().into_owned(),
            path: ".env".into(),
            repo_id: "test/repo".into(),
            link: Some(json!({"mode":"link","store":store})),
        };
        for (placed, detached) in [(b"A=2", true), (b"A=1", false)] {
            std::fs::write(&destination, placed).unwrap();
            let current = checkout_bytes(&adapters, &target).unwrap();
            assert_eq!(current.bytes.as_deref(), Some(placed.as_slice()));
            assert_eq!(current.detached, detached);
        }
    }
}
