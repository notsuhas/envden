use envden_core::errors::ErrorCode;
use envden_protocol::protocol::encoding::*;

#[test]
fn crockford_round_trips_and_rejects_noncanonical_text() {
    for size in 0..128 {
        let bytes: Vec<_> = (0..size).map(|i| i as u8).collect();
        assert_eq!(unbase32(&base32(&bytes)).unwrap(), bytes);
        assert_eq!(unbase32(&base32(&bytes).to_lowercase()).unwrap(), bytes);
    }
    for value in ["O0", "I0", "L0", "U0", "0", "000", "01", "00=", "ß"] {
        assert!(unbase32(value).is_err(), "{value}");
    }
}

#[test]
fn strings_match_js_normalization_and_categories() {
    for value in ["", "hello", "é", "\u{feff}", "\u{200d}"] {
        assert_eq!(
            decode::<String>(&encode(&value.to_owned()).unwrap()).unwrap(),
            value
        );
    }
    for value in ["e\u{301}", "\0", "\n", "\u{7f}", "\u{85}"] {
        assert!(encode(&value.to_owned()).is_err());
    }
    assert!(decode::<String>(&[0, 0, 0, 1, 255]).is_err());
    assert!(decode::<String>(&[0, 0, 0, 1, b'a', 0]).is_err());
    assert_eq!(norm_pw("  ＡÅ  ").unwrap(), "  AÅ  ");
    assert_eq!(norm_pw("\n").unwrap(), "\n");
    assert!(norm_pw("").is_err());
    assert!(is_device_name("é"));
    assert!(!is_device_name("\u{200d}"));
    assert!(!is_device_name(&"é".repeat(33)));
}

#[test]
fn reader_rejects_truncation_limits_options_and_unknown_formats() {
    assert!(Reader::new(&[]).u8().is_err());
    assert!(Reader::new(&[0; 3]).u32().is_err());
    assert!(Reader::new(&[0; 7]).u64().is_err());
    assert!(Reader::new(&[0, 1, 0, 1]).sized(65536).is_err());
    assert!(Reader::new(&[0, 1, 134, 161]).list::<[u8; 1]>().is_err());
    assert!(Reader::new(&[2]).opt::<[u8; 1]>().is_err());
    assert_eq!(
        Reader::new(&[1, 2]).tagged(1).unwrap_err().code,
        ErrorCode::UpdateRequired
    );
    assert!(sorted(&[1, 1], |v| *v).is_err());
    assert!(sorted(&[2, 1], |v| *v).is_err());
    assert!(decode::<[u8; 1]>(&[1, 2]).is_err());
}

#[test]
fn padding_rejects_nonzero_excess_and_unaligned_data() {
    assert_eq!(pad(&[]), Vec::<u8>::new());
    let bytes = pad(&[1]);
    assert_eq!(bytes.len(), 256);
    assert_eq!(decode_padded::<[u8; 1]>(&bytes).unwrap(), [1]);
    let mut bad = bytes.clone();
    bad[255] = 1;
    assert!(decode_padded::<[u8; 1]>(&bad).is_err());
    assert!(decode_padded::<[u8; 1]>(&[0; 512]).is_err());
    assert!(decode_padded::<[u8; 1]>(&[0; 255]).is_err());
}
