use super::*;
use lopdf::Document;

fn normalized(text: &str) -> String {
    text.split_whitespace().collect()
}

#[test]
fn one_page_with_reference_text_and_fields() {
    for (input, reference) in [
        (
            include_str!("../../../../../tests/fixtures/recovery-pdf/kit.json"),
            include_bytes!("../../../../../tests/fixtures/recovery-pdf/kit.pdf").as_slice(),
        ),
        (
            include_str!("../../../../../tests/fixtures/recovery-pdf/long.json"),
            include_bytes!("../../../../../tests/fixtures/recovery-pdf/long.pdf").as_slice(),
        ),
    ] {
        let fixture: Value = serde_json::from_str(input).unwrap();
        let bytes = render_at_zone(
            &fixture["kit"],
            fixture["now"].as_u64().unwrap(),
            fixture["deviceName"].as_str().unwrap(),
            Some("UTC"),
        )
        .unwrap();
        let actual = Document::load_mem(&bytes).unwrap();
        let expected = Document::load_mem(reference).unwrap();
        assert_eq!(actual.get_pages().len(), 1);
        let extracted = actual.extract_text(&[1]).unwrap();
        for field in ["vaultId", "secretKey", "server"] {
            assert!(extracted.contains(fixture["kit"][field].as_str().unwrap()));
        }
        assert_eq!(
            normalized(&actual.extract_text(&[1]).unwrap()),
            normalized(&expected.extract_text(&[1]).unwrap())
        );
    }
}

#[test]
fn rejects_unencodable_fields_but_replaces_unsupported_device_characters() {
    let mut kit = serde_json::json!({"vaultId":"ABC", "secretKey":"EK1-key", "server":"https://example.test"});
    let bytes = render_at_zone(&kit, 1_800_000_000_000, "café 💻 東京", Some("UTC")).unwrap();
    let pdf = Document::load_mem(&bytes).unwrap();
    assert!(pdf.extract_text(&[1]).unwrap().contains("café ? ??"));
    for field in ["vaultId", "secretKey", "server"] {
        let original = kit[field].clone();
        kit[field] = "東京".into();
        let error = render_at_zone(&kit, 1_800_000_000_000, "device", Some("UTC")).unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput);
        kit[field] = original;
    }
}

#[test]
fn long_instruction_words_fit_within_page_margins() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/recovery-pdf/long.json"
    ))
    .unwrap();
    let bytes = render_at_zone(&fixture["kit"], 1_800_000_000_000, "device", Some("UTC")).unwrap();
    let document = Document::load_mem(&bytes).unwrap();
    let page = document.get_pages()[&1];
    let content = lopdf::content::Content::decode(&document.get_page_content(page)).unwrap();
    let mut size = 0.0;
    for operation in content.operations {
        if operation.operator == "Tf" {
            size = operation.operands[1].as_float().unwrap();
        } else if operation.operator == "Tj" && size == 11.0 {
            let text = Document::decode_text(
                &lopdf::Encoding::SimpleEncoding(b"WinAnsiEncoding"),
                operation.operands[0].as_str().unwrap(),
            )
            .unwrap();
            assert!(
                fonts::width(&text, 11.0) <= 595.28 - 128.0,
                "instruction exceeds margins"
            );
        }
    }
}
