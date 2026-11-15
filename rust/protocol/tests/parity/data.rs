use envden_protocol::{chain::*, protocol::*};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub fn read<T: DeserializeOwned>(v: &Value) -> T {
    serde_json::from_value(normalized(v.clone())).unwrap()
}

pub fn normalized(v: Value) -> Value {
    match v {
        Value::Array(a) => Value::Array(a.into_iter().map(normalized).collect()),
        Value::Object(mut o) => {
            if let Some(n) = o.get("fill").and_then(Value::as_u64) {
                return serde_json::json!(vec![n as u8; o["length"].as_u64().unwrap() as usize]);
            }
            if let Some(h) = o.get("hex").and_then(Value::as_str) {
                return serde_json::json!(hex::decode(h).unwrap());
            }
            if let Some(n) = o.get("bigint").and_then(Value::as_str) {
                return serde_json::from_str(n).unwrap();
            }
            if o.get("kind").is_some_and(Value::is_number) {
                let kind = o.remove("kind").unwrap();
                let names = [
                    "Genesis",
                    "AddDevice",
                    "RemoveDevice",
                    "NewEpoch",
                    "ReplaceRecovery",
                    "ServerMoved",
                    "RepairDone",
                    "RenameDevice",
                ];
                let payload = o.remove("payload").unwrap();
                o.insert(
                    "change".into(),
                    serde_json::json!({names[kind.as_u64().unwrap() as usize]: payload}),
                );
            }
            Value::Object(o.into_iter().map(|(k, v)| (k, normalized(v))).collect())
        }
        v => v,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct State {
    vault_id: [u8; 32],
    seq: u64,
    head: [u8; 32],
    devices: Vec<(String, IDeviceRecord)>,
    recovery: IRecoveryRecord,
    epoch: u32,
    server_pin: [u8; 32],
    ever_used_ids: Vec<String>,
    repair_ids: Vec<String>,
    commits: Vec<(u32, [u8; 32])>,
}

pub fn state(v: &Value) -> IDeviceListState {
    let s: State = read(v);
    IDeviceListState {
        vault_id: s.vault_id,
        seq: s.seq,
        head: s.head,
        devices: s
            .devices
            .into_iter()
            .enumerate()
            .map(|(i, (k, d))| {
                (
                    unbase32(&k)
                        .ok()
                        .and_then(|v| v.try_into().ok())
                        .unwrap_or([i as u8; 16]),
                    d,
                )
            })
            .collect(),
        recovery: s.recovery,
        epoch: s.epoch,
        server_pin: s.server_pin,
        ever_used_ids: s
            .ever_used_ids
            .iter()
            .map(|s| unbase32(s).unwrap().try_into().unwrap())
            .collect(),
        repair_ids: s
            .repair_ids
            .iter()
            .map(|s| unbase32(s).unwrap().try_into().unwrap())
            .collect(),
        commits: s.commits.into_iter().collect(),
    }
}

pub fn set<const N: usize>(v: &Value) -> BTreeSet<[u8; N]> {
    v.as_array()
        .map(|a| {
            a.iter()
                .map(|s| unbase32(s.as_str().unwrap()).unwrap().try_into().unwrap())
                .collect()
        })
        .unwrap_or_default()
}

pub fn checkpoint(v: &Value) -> ICheckpoint {
    ICheckpoint {
        header: read(&v["header"]),
        files: read(&v["files"]),
        state: state(&v["state"]),
        id_key: read(&v["idKey"]),
    }
}

pub fn swap(v: &Value) -> Option<ISwap> {
    let sk_pub = if v["skPub"].is_null() {
        None
    } else {
        Some(serde_json::from_value(v["skPub"].clone()).ok()?)
    };
    Some(ISwap {
        expected_head: read(&v["expectedHead"]),
        entries: read(&v["entries"]),
        header: read(&v["header"]),
        files: read(&v["files"]),
        keyring: read(&v["keyring"]),
        envelope: read(&v["envelope"]),
        sk_pub,
        opaque_record: read(&v["opaqueRecord"]),
        approver: read(&v["approver"]),
    })
}

pub fn context(v: &Value) -> ISwapContext {
    ISwapContext {
        previous: read(&v["previous"]),
        state: state(&v["state"]),
        files: read(&v["files"]),
        request_signer: read(&v["requestSigner"]),
        missing_blobs: set(&v["missingBlobs"]),
        destination_pin: read(&v["destinationPin"]),
        ancestor_header_hashes: set(&v["ancestorHeaderHashes"]),
        repair_registration_required: v["repairRegistrationRequired"].as_bool().unwrap_or(false),
    }
}

pub struct Source(pub BTreeMap<String, Value>);

impl Source {
    fn get<T: DeserializeOwned>(
        &self,
        method: &str,
        key: Value,
    ) -> envden_core::errors::Result<Option<T>> {
        let k = format!("{method}:{key}");
        let v = self
            .0
            .get(&k)
            .unwrap_or_else(|| panic!("unrecorded source call {k}"));
        if !v["error"].is_null() {
            return Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::parse(v["error"]["code"].as_str().unwrap())
                    .unwrap(),
                if v["error"]["message"] == "Source unavailable" {
                    "Source unavailable"
                } else {
                    "source failure"
                },
            ));
        }
        Ok(read(&v["value"]))
    }
}

impl IChainSource for Source {
    fn header(
        &self,
        h: &[u8; 32],
    ) -> envden_core::errors::Result<Option<ISigned<IManifestHeader>>> {
        self.get("header", serde_json::json!(h))
    }
    fn entry(&self, h: &[u8; 32]) -> envden_core::errors::Result<Option<ISigned<TEntry>>> {
        self.get("entry", serde_json::json!(h))
    }
    fn files(&self, h: &[u8; 32]) -> envden_core::errors::Result<Option<IFiles>> {
        self.get("files", serde_json::json!(h))
    }
    fn keyring(&self, h: &[u8; 32]) -> envden_core::errors::Result<Option<Vec<u8>>> {
        self.get("keyring", serde_json::json!(h))
    }
    fn epoch_key(&self, e: u32) -> envden_core::errors::Result<Option<[u8; 32]>> {
        self.get("epochKey", serde_json::json!(e))
    }
}
