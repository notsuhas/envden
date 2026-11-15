use super::data::*;
use envden_core::errors::Result;
use envden_protocol::{chain::*, protocol::*};
use serde_json::{Value, json};

pub fn check(v: &Value) -> Result<Value> {
    let a = v["input"].as_array().unwrap();
    Ok(match v["name"].as_str().unwrap() {
        "repairLoginDecision" => json!(repair_login_decision(&read::<Vec<IManifestHeader>>(&a[0]))),
        "refuseSecretKeyProof" => json!(refuse_secret_key_proof(
            &read::<Vec<IManifestHeader>>(&a[0]),
            read(&a[1])
        )),
        "isReusedRepairToken" => json!(is_reused_repair_token(&read(&a[0]), &set(&a[1]))),
        "filterRepairReports" => {
            let i = &a[0];
            json!(filter_repair_reports(
                &read::<Vec<ISigned<IRepairReport>>>(&i["reports"]),
                &read(&i["repairId"]),
                &state(&i["state"]),
                &set(&i["headerHashes"])
            ))
        }
        "missingReportMembers" => {
            assert_eq!(
                missing_report_members(&state(&a[0]), &read::<Vec<ISigned<IRepairReport>>>(&a[1])),
                read::<Vec<IDeviceRecord>>(&v["result"])
            );
            v["result"].clone()
        }
        "classifyMissingBlobs" => {
            let (missing, lost) = classify_missing_blobs(
                &read(&a[0]),
                &set(&a[1]),
                &read::<Vec<ISigned<IRepairReport>>>(&a[2]),
            );
            json!({"missing":missing,"lost":lost})
        }
        "chooseRecoveryCandidate" => {
            let i = &a[0];
            let history = i["history"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| (read(&r["header"]), read(&r["files"])))
                .collect::<Vec<_>>();
            match choose_recovery_candidate(
                &read(&i["fileId"]),
                read(&i["beforeVersion"]),
                &history,
                &set(&i["availableBlobs"]),
            )? {
                TRecoveryCandidate::Lost => json!({"kind":"lost"}),
                TRecoveryCandidate::Recovered { entry, header } => {
                    json!({"kind":"recovered","entry":entry,"header":header})
                }
            }
        }
        name => panic!("unhandled {name}"),
    })
}
