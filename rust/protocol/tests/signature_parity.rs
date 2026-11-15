use envden_protocol::protocol::verify;
use serde::Deserialize;

#[derive(Deserialize)]
struct IVector {
    name: String,
    public: String,
    signature: String,
    message: String,
    expected: bool,
}

#[test]
fn signatures_match_noble_strict_cofactored_verification() {
    let vectors: Vec<IVector> = serde_json::from_str(include_str!(
        "../../../parity/fixtures/signatures/vectors.json"
    ))
    .unwrap();
    for vector in vectors {
        let public = hex::decode(vector.public).unwrap().try_into().unwrap();
        assert_eq!(
            verify(
                &public,
                "request",
                &hex::decode(vector.message).unwrap(),
                &hex::decode(vector.signature).unwrap()
            ),
            vector.expected,
            "{}",
            vector.name
        );
    }
}
