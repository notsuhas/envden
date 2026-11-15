#[path = "parity/opaque.rs"]
mod opaque;
#[path = "parity/vault/operations.rs"]
mod operations;
#[path = "parity/pairing.rs"]
mod pairing;
#[path = "parity/settings.rs"]
mod settings;
mod support;
#[path = "parity/auth/verification.rs"]
mod verification;

#[path = "parity/vault/joins.rs"]
mod joins;
#[path = "parity/rate_limits.rs"]
mod rate_limits;
#[path = "parity/registration.rs"]
mod registration;
#[path = "parity/repair/material.rs"]
mod repair_material;

#[path = "parity/body/availability.rs"]
mod availability;
#[path = "parity/body/authorization.rs"]
mod body_authorization;
#[path = "parity/vault/cache.rs"]
mod cache;
#[path = "parity/vault/move_session.rs"]
mod move_session;
#[path = "parity/vault/rename.rs"]
mod rename;
#[path = "parity/repair/close.rs"]
mod repair_close;

#[path = "parity/body/limits.rs"]
mod body_limits;
#[path = "parity/body/races.rs"]
mod body_races;
#[path = "parity/vault/data.rs"]
mod data;
#[path = "parity/vault/move_policy.rs"]
mod move_policy;
#[path = "parity/pairing/joining.rs"]
mod pairing_joining;
#[path = "parity/pairing/limits.rs"]
mod pairing_limits;
#[path = "parity/pairing/rollback.rs"]
mod pairing_rollback;
#[path = "parity/auth/registration_proofs.rs"]
mod registration_proofs;
#[path = "parity/repair/changed.rs"]
mod repair_changed;
#[path = "parity/repair/files/changes.rs"]
mod repair_files_changes;
#[path = "parity/repair/files/close.rs"]
mod repair_files_close;
#[path = "parity/repair/files/setup.rs"]
mod repair_files_setup;
#[path = "parity/repair/finish.rs"]
mod repair_finish;
#[path = "parity/repair/registration.rs"]
mod repair_registration;
#[path = "parity/status.rs"]
mod status_parity;
