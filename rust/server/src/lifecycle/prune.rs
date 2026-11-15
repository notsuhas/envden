use crate::http::types::IAppOptions;
use envden_core::{adapters::storage::IHistoryPolicy, errors::Result};

fn safely(run: impl FnOnce() -> Result<()>) -> bool {
    match run() {
        Ok(()) => true,
        Err(error) => {
            eprintln!("envden history pruning failed: {}", error.code);
            false
        }
    }
}

pub fn prune_history_safely(options: &IAppOptions) -> bool {
    let policy = IHistoryPolicy {
        max_age: 90 * 86400000,
        min_versions: 20,
    };
    let prune = |id: &[u8]| {
        safely(|| {
            options
                .storage
                .prune(id, &policy, (options.now)())
                .map(|_| ())
        })
    };
    let server = prune(&[0; 32]);
    let mut clean = true;
    let listed = safely(|| {
        for id in options.storage.vault_ids()? {
            clean = prune(&id) && clean;
        }

        Ok(())
    });

    server && listed && clean
}
