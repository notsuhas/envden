use envden_protocol::protocol::*;
use serde_json::Value;
use sha2::{Digest, Sha256};

fn vector(name: &str) -> Value {
    serde_json::from_slice(
        &std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/vectors")
                .join(name),
        )
        .unwrap(),
    )
    .unwrap()
}

fn b(v: &Value) -> Vec<u8> {
    hex::decode(v.as_str().unwrap()).unwrap()
}

fn f<const N: usize>(v: &Value) -> [u8; N] {
    b(v).try_into().unwrap()
}

#[path = "gate_one/compositions.rs"]
mod compositions;
#[path = "gate_one/known_answers.rs"]
mod known_answers;
#[path = "gate_one/opaque_states.rs"]
mod opaque_states;
