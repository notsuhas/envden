use crate::client::binary;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain::IDeviceListState, protocol as p};
use serde_json::Value;

pub fn decode_verified_state(value: &Value) -> Result<IDeviceListState> {
    let bytes =
        |v: &Value| -> Result<Vec<u8>> { binary(v["$bytes"].as_str().ok_or_else(invalid)?) };
    let number = |v: &Value| -> Result<u64> {
        v["$bigint"]
            .as_str()
            .and_then(|v| v.parse().ok())
            .or_else(|| v.as_u64())
            .ok_or_else(invalid)
    };
    let record = |v: &Value| -> Result<p::IDeviceRecord> {
        Ok(p::IDeviceRecord {
            id: p::fixed(&bytes(&v["id"])?)?,
            name: v["name"].as_str().ok_or_else(invalid)?.into(),
            enc_pub: p::fixed(&bytes(&v["encPub"])?)?,
            obj_pub: p::fixed(&bytes(&v["objPub"])?)?,
            req_pub: p::fixed(&bytes(&v["reqPub"])?)?,
        })
    };
    let devices = value["devices"]["$map"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .map(|pair| {
            Ok((
                p::fixed(&p::unbase32(pair[0].as_str().ok_or_else(invalid)?)?)?,
                record(&pair[1])?,
            ))
        })
        .collect::<Result<_>>()?;
    let commits = value["commits"]["$map"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .map(|pair| {
            Ok((
                u32::try_from(number(&pair[0])?).map_err(|_| invalid())?,
                p::fixed(&bytes(&pair[1])?)?,
            ))
        })
        .collect::<Result<_>>()?;
    let recovery = &value["recovery"];
    let ever_used_ids = value["everUsedIds"]["$set"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .map(|v| p::fixed(&p::unbase32(v.as_str().ok_or_else(invalid)?)?))
        .collect::<Result<_>>()?;
    let repair_ids = value["repairIds"]["$set"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .map(|v| p::fixed(&p::unbase32(v.as_str().ok_or_else(invalid)?)?))
        .collect::<Result<_>>()?;
    Ok(IDeviceListState {
        vault_id: p::fixed(&bytes(&value["vaultId"])?)?,
        seq: number(&value["seq"])?,
        head: p::fixed(&bytes(&value["head"])?)?,
        devices,
        recovery: p::IRecoveryRecord {
            id: p::fixed(&bytes(&recovery["id"])?)?,
            enc_pub: p::fixed(&bytes(&recovery["encPub"])?)?,
            obj_pub: p::fixed(&bytes(&recovery["objPub"])?)?,
        },
        epoch: u32::try_from(number(&value["epoch"])?).map_err(|_| invalid())?,
        server_pin: p::fixed(&bytes(&value["serverPin"])?)?,
        ever_used_ids,
        repair_ids,
        commits,
    })
}

fn invalid() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state")
}
