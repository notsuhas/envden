mod device;
pub mod name;
mod rename;
mod stored;

pub use device::device_identity;
pub use rename::adopt_committed_name;
pub use stored::{IDeviceIdentity, ISecretKeys, identity_bytes, read_identity};

#[cfg(test)]
mod tests;
