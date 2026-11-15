#[path = "parity/chain.rs"]
mod chain;
#[path = "parity/data.rs"]
mod data;
#[path = "parity/repair.rs"]
mod repair;

#[test]
fn frozen_typescript_chain_cases() {
    for (index, v) in fixtures(include_str!("parity/fixtures/chain.json"))
        .into_iter()
        .enumerate()
    {
        eprintln!("{} {} {}", index, v["case"], v["name"]);
        let result = chain::check(&v);
        if !v["error"].is_null() {
            let e = result.unwrap_err();
            assert_eq!(serde_json::json!(e.code.as_str()), v["error"]["code"]);
            if v["name"] == "acceptManifest" {
                assert_eq!(e.message, v["error"]["message"].as_str().unwrap());
            }
        } else {
            assert_eq!(result.unwrap(), v["result"]);
        }
    }
}

#[path = "parity/codecs.rs"]
mod codecs;
#[path = "parity/opaque.rs"]
mod opaque;

#[test]
fn frozen_typescript_protocol_cases() {
    use envden_protocol::protocol::*;
    use serde_json::json;
    for (index, v) in fixtures(include_str!("parity/fixtures/protocol.json"))
        .into_iter()
        .enumerate()
    {
        eprintln!("{index} {} {}", v["case"], v["name"]);
        let a = &v["input"];
        let name = v["name"].as_str().unwrap();
        let r = if name.contains(':') {
            crate::codecs::run(&v)
        } else if name.starts_with("opaque") {
            crate::opaque::check(&v)
        } else {
            match name {
                "normalizePairingCode" => normalize_pairing_code(a[0].as_str().unwrap())
                    .map(|(mailbox, password)| json!({"mailbox":mailbox,"password":password})),
                "validateEdPublic" => {
                    validate_ed_public(&data::read(&a[0])).map(|()| serde_json::Value::Null)
                }
                "openPairJoiner" => {
                    open_pair_joiner(&data::read::<Vec<u8>>(&a[0]), &data::read(&a[1]))
                        .map(|r| json!(r))
                }
                "openPairApprover" => {
                    open_pair_approver(&data::read::<Vec<u8>>(&a[0]), &data::read(&a[1]))
                        .map(|r| json!(r))
                }
                "Verify" => {
                    assert_eq!(
                        verify(
                            &data::read(&a[0]),
                            a[1].as_str().unwrap(),
                            &data::read::<Vec<u8>>(&a[2]),
                            &data::read::<Vec<u8>>(&a[3])
                        ),
                        v["result"]["ok"]
                    );
                    Ok(v["result"].clone())
                }
                _ => panic!("unknown call {name}"),
            }
        };
        if !v["error"].is_null() {
            let e = r.unwrap_err();
            assert_eq!(e.code.as_str(), v["error"]["code"]);
        } else {
            assert_eq!(r.unwrap(), v["result"]);
        }
    }
}

#[path = "parity/unknown.rs"]
mod unknown;

#[path = "parity/crypto.rs"]
mod crypto_cases;
#[path = "parity/requests.rs"]
mod request_cases;

#[path = "parity/encoding.rs"]
mod encoding_cases;

fn fixtures(text: &str) -> Vec<serde_json::Value> {
    let groups: Vec<serde_json::Value> = serde_json::from_str(text).unwrap();
    groups
        .into_iter()
        .flat_map(|group| {
            group["calls"]
                .as_array()
                .unwrap()
                .iter()
                .map(|call| {
                    let mut call = call.clone();
                    call["case"] = group["case"].clone();
                    data::normalized(call)
                })
                .collect::<Vec<_>>()
        })
        .collect()
}
