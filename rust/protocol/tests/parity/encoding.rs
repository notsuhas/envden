use envden_core::errors::ErrorCode;
use envden_protocol::protocol::*;

#[test]
fn reference_padding_and_pairing_channel() {
    let mut encoded = vec![];
    sized(&[1], 65536, &mut encoded).unwrap();
    let data = pad(&encoded);
    assert_eq!(data.len(), 256);
    let mut r = Reader::new(&data);
    assert_eq!(r.sized(65536).unwrap(), vec![1]);
    assert!(decode_padded::<SizedByte>(&data[..255]).is_err());
    let mut bad = data.clone();
    bad[255] = 1;
    assert!(decode_padded::<SizedByte>(&bad).is_err());
    assert!(decode_padded::<SizedByte>(&[data, vec![0; 256]].concat()).is_err());
    assert_eq!(
        decode_padded::<SizedByte>(&pad(&encoded)).unwrap().0,
        vec![1]
    );
    let (a, b) = pairing_channel_keys(&[0; 64]).unwrap();
    assert_ne!(a, b);
    let key: [u8; 32] = std::array::from_fn(|i| i as u8);
    let nonce = std::array::from_fn(|i| i as u8);
    let boxed = seal_box(&a, &key, &[], &nonce).unwrap();
    assert_eq!(open_box(&a, &boxed, &[]).unwrap(), key);
    assert!(open_box(&b, &boxed, &[]).is_err());
    for text in [
        "01-0000-0000",
        "0-0000-0000",
        "1000-0000-0000",
        "1-!!!!-0000",
        "12-ABCD-EFG",
        "999-0000-000",
        "12 ABCD EFG",
        "1-0000-00000",
    ] {
        let e = normalize_pairing_code(text).unwrap_err();
        assert_eq!(e.code, ErrorCode::InvalidInput);
        assert_eq!(e.message, "Codes look like 3-K7QF-2MXP");
    }
    for s in ["e\u{301}", "a\n", "\0", "\u{85}"] {
        assert!(encode(&s.to_owned()).is_err());
    }
    for s in ["é", "\u{feff}hello"] {
        assert_eq!(
            decode::<String>(&encode(&s.to_owned()).unwrap()).unwrap(),
            s
        );
    }
    assert_eq!(norm_pw(" Ａ ").unwrap(), " A ");
    assert!(parse_semver("0.0.0").is_ok());
    for s in [
        "1.2", "v1.2.3", "1.2.3-a", "-1.2.3", "01.2.3", "1.02.3", "1.2.03",
    ] {
        assert!(parse_semver(s).is_err());
    }
    let key: [u8; 32] = std::array::from_fn(|i| i as u8);
    for path in [
        "",
        "/a",
        "a/",
        "../../__tests__/a",
        "/root",
        "a//b",
        "a/./b",
        "a/../b",
        "C:secret",
        "a:x",
        "a\\b",
        "a./b",
        "a /b",
        "CON",
        "nul.env",
        "dir/COM1.txt",
        "LPT9",
        "a\u{1}b",
        "a\u{85}b",
        "e\u{301}",
    ] {
        assert!(file_id(&key, "repo", path).is_err());
    }
    assert_ne!(
        file_id(&key, "repo", "A").unwrap(),
        file_id(&key, "repo", "a").unwrap()
    );
}

#[derive(Debug)]
struct SizedByte(Vec<u8>);

impl ICodec for SizedByte {
    fn read(r: &mut Reader<'_>) -> envden_core::errors::Result<Self> {
        Ok(Self(r.sized(65536)?))
    }
    fn write(&self, out: &mut Vec<u8>) -> envden_core::errors::Result<()> {
        sized(&self.0, 65536, out)
    }
}

#[test]
fn reference_primitive_verification() {
    use ed25519_dalek::{Signature, VerifyingKey};
    let v: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/core/src/protocol/__tests__/vectors/known.json"
    ))
    .unwrap();
    let ed = &v["ed25519"];
    let public: [u8; 32] = hex::decode(ed["public"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    let sig =
        Signature::from_slice(&hex::decode(ed["signature"].as_str().unwrap()).unwrap()).unwrap();
    VerifyingKey::from_bytes(&public)
        .unwrap()
        .verify_strict(&[], &sig)
        .unwrap();
}

#[test]
fn reference_list_limits_do_not_decode_elements() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static READS: AtomicUsize = AtomicUsize::new(0);
    struct Counted;
    impl ICodec for Counted {
        fn read(r: &mut Reader<'_>) -> envden_core::errors::Result<Self> {
            READS.fetch_add(1, Ordering::SeqCst);
            r.u8()?;
            Ok(Self)
        }
        fn write(&self, out: &mut Vec<u8>) -> envden_core::errors::Result<()> {
            out.push(0);
            Ok(())
        }
    }
    let data = [100001u32.to_be_bytes().as_slice(), &vec![0; 100001]].concat();
    assert_eq!(
        Reader::new(&data).list::<Counted>().err().unwrap().code,
        ErrorCode::InvalidData
    );
    assert_eq!(READS.load(Ordering::SeqCst), 0);
    for values in [vec![2u8, 1], vec![1, 1]] {
        assert!(sorted(&values, |n| *n).is_err());
    }
    let bytes = [0, 0, 0, 2, 2, 1];
    let values = Reader::new(&bytes).list::<u8>().unwrap();
    assert!(sorted(&values, |n| *n).is_err());
}
