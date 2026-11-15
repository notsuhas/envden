use envden_core::merge::*;
use serde_json::{Value, json};
fn bytes(v: &Value) -> Vec<u8> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_u64().unwrap() as u8)
        .collect()
}
fn conflict(c: TConflict) -> Value {
    let mut v = json!({"kind":"conflict","reason":c.reason});
    if let Some(key) = c.key {
        v["key"] = json!(key);
    }
    v
}
#[test]
fn typescript_merge_vectors() {
    let vectors: Vec<Value> = serde_json::from_str(include_str!("fixtures/merge.json")).unwrap();
    for (i, v) in vectors.iter().enumerate() {
        let a = v["args"].as_array().unwrap();
        let actual = match v["name"].as_str().unwrap() {
            "mergeEnv" => match merge_env(&bytes(&a[0]), &bytes(&a[1]), &bytes(&a[2])) {
                Ok(r) => json!({"kind":"clean","bytes":r.bytes,"changedKeys":r.changed_keys}),
                Err(c) => conflict(c),
            },
            "parseEnv" => match parse_env(&bytes(&a[0])) {
                Ok(r) => {
                    json!({"kind":"parsed","head":r.head,"tail":r.tail,"entries":r.entries.iter().map(|e|json!({"key":e.key,"raw":e.raw,"exported":e.exported,"quote":e.quote,"active":e.active})).collect::<Vec<_>>()})
                }
                Err(c) => conflict(c),
            },
            "diffEnvKeys" => match diff_env_keys(&bytes(&a[0]), &bytes(&a[1])) {
                Ok(r) => {
                    json!({"kind":"diff","added":r.added,"removed":r.removed,"changed":r.changed})
                }
                Err(c) => conflict(c),
            },
            "hasConflictMarkers" => json!(has_conflict_markers(&bytes(&a[0]))),
            "markConflicts" => match mark_conflicts(
                a[0].as_array().map(|_| bytes(&a[0])).as_deref(),
                &bytes(&a[1]),
                &bytes(&a[2]),
                &ILabels {
                    mine: a[3]["mine"].as_str().unwrap().into(),
                    theirs: a[3]["theirs"].as_str().unwrap().into(),
                },
            ) {
                TMarked::Keys { bytes, keys } => json!({"kind":"keys","bytes":bytes,"keys":keys}),
                TMarked::File { bytes } => json!({"kind":"file","bytes":bytes}),
            },
            name => panic!("unknown {name}"),
        };
        assert_eq!(actual, v["result"], "vector {i}: {}", v["name"]);
    }
}
#[test]
fn selection_and_value_decisions() {
    let base = IEnvEntry {
        key: "A".into(),
        raw: b"A=1".to_vec(),
        exported: false,
        quote: String::new(),
        active: true,
    };
    let edit = IEnvEntry {
        raw: b"A=2".to_vec(),
        ..base.clone()
    };
    let exported = IEnvEntry {
        exported: true,
        ..base.clone()
    };
    for (original, mine, theirs, clean) in [
        (Some(&base), Some(&base), Some(&base), true),
        (Some(&base), Some(&edit), Some(&base), true),
        (Some(&base), None, None, true),
        (Some(&base), None, Some(&edit), false),
        (Some(&base), Some(&edit), Some(&edit), true),
        (Some(&base), Some(&exported), Some(&base), false),
    ] {
        assert_eq!(select_entry("A", original, mine, theirs).is_ok(), clean);
    }
    for (value, quote, remaining, valid) in [
        ("'ok'", "'", "", true),
        ("'open", "'", "", false),
        ("'open", "'", "later'", false),
        ("'ok' extra", "'", "", false),
        ("value\\", "", "", false),
    ] {
        assert_eq!(validate_value(value, quote, "A", remaining).is_ok(), valid);
    }
}
