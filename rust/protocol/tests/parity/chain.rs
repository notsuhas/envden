use super::data::*;
use envden_core::errors::Result;
use envden_protocol::{chain::*, protocol::*};
use serde_json::{Value, json};

pub fn check(v: &Value) -> Result<Value> {
    let a = v["input"].as_array().unwrap();
    let expected = &v["result"];
    let source = Source(read(&v["sources"]));
    Ok(match v["name"].as_str().unwrap() {
        "applyEntry" | "verifyChain" => {
            let r = if v["name"] == "verifyChain" {
                verify_chain(&read::<Vec<ISigned<TEntry>>>(&a[0]))?
            } else {
                apply_entry(
                    a[0].as_object().map(|_| state(&a[0])).as_ref(),
                    &read(&a[1]),
                )?
            };
            match r {
                TDeviceListResult::Invalid => json!({"kind":"invalid"}),
                TDeviceListResult::Valid { state: s } => {
                    assert_eq!(*s, state(&expected["state"]));
                    expected.clone()
                }
            }
        }
        "validateSwap" => {
            let Some(s) = swap(&a[0]) else {
                return Ok(json!({"kind":"invalid"}));
            };
            match validate_swap(&s, &context(&a[1]))? {
                TSwapResult::Invalid => json!({"kind":"invalid"}),
                TSwapResult::Valid {
                    authorization,
                    state: s,
                } => {
                    assert_eq!(json!(authorization), expected["authorization"]);
                    assert_eq!(*s, state(&expected["state"]));
                    expected.clone()
                }
            }
        }
        "operationRequirement" => json!(operation_requirement(
            &read(&a[0]),
            &read(&a[1]),
            &read::<Vec<ISigned<TEntry>>>(&a[2]),
            &state(&a[3]),
            false
        )?),
        "changedFiles" => json!(changed_files(
            &read(&a[0]),
            &read(&a[1]),
            read(&a[2]),
            read(&a[3]),
            a.get(4).and_then(|v| v.as_u64()).map(|n| n as u8)
        )?),
        "checkHeaderSignature" => {
            check_header_signature(&source, &state(&a[1]), &read(&a[2]))?;
            Value::Null
        }
        "acceptManifest" => {
            let i = &a[0];
            match accept_manifest(
                &checkpoint(&i["checkpoint"]),
                &read(&i["head"]),
                &read::<Vec<ISigned<IManifestHeader>>>(&i["storedHeaders"]),
                &source,
                &set(&i["localFileIds"]),
            )? {
                TManifestResult::Invalid => json!({"kind":"invalid"}),
                TManifestResult::Unchanged => json!({"kind":"unchanged"}),
                TManifestResult::Fork => json!({"kind":"fork"}),
                TManifestResult::Rollback => json!({"kind":"rollback"}),
                TManifestResult::Accepted {
                    checkpoint: c,
                    headers,
                    repairs,
                    no_fast_forward,
                } => {
                    let e = checkpoint(&expected["checkpoint"]);
                    assert_eq!(c.header, e.header);
                    assert_eq!(c.files, e.files);
                    assert_eq!(c.state, e.state);
                    assert_eq!(c.id_key, e.id_key);
                    assert_eq!(
                        headers,
                        read::<Vec<ISigned<IManifestHeader>>>(&expected["headers"])
                    );
                    assert_eq!(repairs, read::<Vec<IFileEntry>>(&expected["repairs"]));
                    assert_eq!(no_fast_forward, set(&expected["noFastForward"]));
                    expected.clone()
                }
            }
        }
        "classifyNonMember" => {
            let i = &a[0];
            let sh = read::<Vec<ISigned<IManifestHeader>>>(&i["storedHeaders"]);
            let se = read::<Vec<ISigned<TEntry>>>(&i["storedEntries"]);
            let vh = read::<Vec<ISigned<IManifestHeader>>>(&i["verifiedHeaders"]);
            let ve = read::<Vec<ISigned<TEntry>>>(&i["verifiedEntries"]);
            let s = state(&i["state"]);
            match classify_non_member(INonMemberInput {
                device_id: read(&i["deviceId"]),
                stored_headers: &sh,
                stored_entries: &se,
                verified_headers: &vh,
                verified_entries: &ve,
                state: &s,
            })? {
                TNonMember::Fork => json!({"kind":"fork"}),
                TNonMember::Rollback => json!({"kind":"rollback"}),
                TNonMember::DroppedByRepair => json!({"kind":"dropped-by-repair"}),
                TNonMember::Removed { entry } => {
                    assert_eq!(*entry, read(&expected["entry"]));
                    expected.clone()
                }
            }
        }
        "classifyUnknownData" | "decodeServerObject" => super::unknown::check(v)?,
        _ => super::repair::check(v)?,
    })
}
