mod adapter;
mod case;
mod checkout;
mod discovery;
mod exec;
mod ignore;
mod remote;
pub use adapter::{IGitRepoOptions, TResolveHost, create_git_repo_adapter};

pub use remote::normalize_repo_id;

#[cfg(test)]
mod parity;

#[cfg(test)]
mod tests;
