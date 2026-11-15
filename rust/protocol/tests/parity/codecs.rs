use super::data::read;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

fn check<T: ICodec + Serialize + DeserializeOwned>(v: &Value, write: bool) -> Result<Value> {
    if write {
        let value = serde_json::from_value::<T>(super::data::normalized(v["input"][0].clone()))
            .map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid typed input", e)
            })?;
        let encoded = encode(&value)?;
        for end in 0..encoded.len() {
            assert_eq!(
                decode::<T>(&encoded[..end]).err().unwrap().code,
                ErrorCode::InvalidData
            );
        }
        Ok(json!(encoded))
    } else {
        let value = decode::<T>(&read::<Vec<u8>>(&v["input"][0]))?;
        let expected: T = read(&v["result"]);
        assert_eq!(encode(&value)?, encode(&expected)?);
        Ok(v["result"].clone())
    }
}

pub fn run(v: &Value) -> Result<Value> {
    let (action, name) = v["name"].as_str().unwrap().split_once(':').unwrap();
    if name == "Swap" {
        return if action == "write" {
            let encoded = encode(&super::data::swap(&v["input"][0]).unwrap())?;
            for end in 0..encoded.len() {
                assert_eq!(
                    decode::<ISwap>(&encoded[..end]).err().unwrap().code,
                    ErrorCode::InvalidData
                );
            }
            Ok(json!(encoded))
        } else {
            let s: ISwap = decode(&read::<Vec<u8>>(&v["input"][0]))?;
            assert_eq!(s, super::data::swap(&v["result"]).unwrap());
            Ok(v["result"].clone())
        };
    }
    macro_rules! cases {($($name:literal=>$ty:ty),*)=>{match name{$($name=>check::<$ty>(v,action=="write"),)*_=>panic!("unknown codec {name}")}};}
    cases!("DeviceRecord"=>IDeviceRecord,"RecoveryRecord"=>IRecoveryRecord,"Wrap"=>IWrap,"EpochChange"=>IEpochChange,"ManifestHeader"=>IManifestHeader,"PairJoiner"=>IPairJoiner,"PairApprover"=>IPairApprover,"RepairReport"=>IRepairReport,"Envelope"=>IEnvelope,"Keyring"=>IKeyring,"Files"=>IFiles,"Entry"=>TEntry,"RenameDevice"=>IRenameDevice,"FileEntry"=>IFileEntry,"File"=>IFile,"Request"=>IRequest)
}
