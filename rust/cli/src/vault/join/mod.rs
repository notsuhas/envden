mod encode;
mod material;
mod state;

pub use encode::encode_verified_state;
pub use material::{ICheckpointMaterial, checkpoint_material};
pub use state::decode_verified_state;

#[cfg(test)]
mod tests;
