use super::data::*;
use envden_core::errors::Result;
use envden_protocol::{chain::*, protocol::*};
use serde_json::{Value, json};

fn kind(k: TUnknownData) -> Value {
    json!({"kind":match k {TUnknownData::Known=>"known",TUnknownData::Fork=>"fork",TUnknownData::Rollback=>"rollback",TUnknownData::Invalid=>"invalid",TUnknownData::UpdateRequired=>"update-required",TUnknownData::Unreadable=>"unreadable"}})
}

pub fn check(v: &Value) -> Result<Value> {
    let i = &v["input"][0];
    let received = read::<Vec<u8>>(&i["received"]);
    let stored = read::<Option<Vec<u8>>>(&i["stored"]);
    let input = IUnknownData {
        received: &received,
        stored: stored.as_deref(),
        mismatch: if i["mismatch"] == "fork" {
            TUnknownData::Fork
        } else {
            TUnknownData::Rollback
        },
        unknown_format: i["unknownFormat"].as_bool().unwrap_or(false),
        current_version: i["currentVersion"].as_str().unwrap(),
        latest_version: i["latestVersion"].as_str().unwrap(),
    };
    if v["name"] == "classifyUnknownData" {
        return Ok(kind(classify_unknown_data(input, || {
            i["verifyResult"].as_bool().unwrap()
        })?));
    }
    let members = i["members"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| (read(&m["id"]), read(&m["objPub"])))
        .collect::<Vec<_>>();
    match decode_server_object::<TEntry>(input, &members, "entry")? {
        TServerObject::Unknown(k) => Ok(kind(k)),
        TServerObject::Known { .. } => panic!("expected unknown"),
    }
}
