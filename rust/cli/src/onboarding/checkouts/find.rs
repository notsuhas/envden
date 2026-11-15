use crate::{
    adapters::IAdapters,
    links::{
        approval::repo_of,
        discovery::repos::{IDiscoveryScope, IRepoSkip, discover_repos},
    },
    output::{home_path, progress::scan_progress},
    settings::read_config,
};
use envden_core::{
    adapters::{ICheckout, IEnvFileRules},
    errors::Result,
};
use serde_json::Value;
use std::{collections::HashSet, path::PathBuf, sync::Mutex};

pub(in crate::onboarding) struct IEligible {
    pub checkout: ICheckout,
    pub files: Vec<String>,
}

pub(in crate::onboarding) fn find_checkouts(
    adapters: &IAdapters,
    state: &Value,
    stored_repos: &HashSet<String>,
    roots: Option<&[PathBuf]>,
    excluded: &[PathBuf],
) -> Result<(Vec<IEligible>, Vec<IRepoSkip>)> {
    let defaults = [adapters.user_home.clone()];
    let roots = roots.unwrap_or(&defaults);
    let home = adapters
        .user_home
        .canonicalize()
        .unwrap_or_else(|_| adapters.user_home.clone());
    let shown = roots
        .iter()
        .map(|root| home_path(&root.canonicalize().unwrap_or_else(|_| root.clone()), &home))
        .collect::<Vec<_>>()
        .join(", ");
    let progress = scan_progress(&shown, None);
    let skips = Mutex::new(vec![]);
    let result = (|| {
        let scope = IDiscoveryScope {
            roots: roots.into(),
            excluded: excluded.into(),
            home: Some(adapters.user_home.clone()),
        };
        let repos = discover_repos(
            &*adapters.repo,
            &scope,
            &|skip| skips.lock().expect("scan reports").push(skip),
            &|found| progress.found(found as u64),
        );
        let config = read_config(&adapters.home)?;
        let strings = |key: &str| {
            config["env-files"][key].as_array().map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect()
            })
        };
        let rules = config["env-files"].is_object().then(|| IEnvFileRules {
            include: strings("include"),
            exclude: strings("exclude"),
            extra_skipped: strings("extraSkipped"),
        });
        let mut eligible = vec![];
        for checkout in repos {
            let files = adapters.repo.env_files(&checkout, rules.as_ref())?;
            if !files.is_empty() || stored_repos.contains(repo_of(state, &checkout.repo_id)) {
                eligible.push(IEligible { checkout, files });
            }
        }
        Ok(eligible)
    })();
    match result {
        Ok(eligible) => {
            progress.done(eligible.len() as u64);
            Ok((eligible, skips.into_inner().expect("scan reports")))
        }
        Err(error) => {
            progress.abort();
            Err(error)
        }
    }
}
