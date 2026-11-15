use crate::{
    auth::{finish_login, finish_registration},
    http::{
        encoding::{binary, input, text},
        errors::response,
        types::IAppOptions,
    },
    middleware::{IAuth, require_gate},
    moving::require_move,
    vault::{commit_swap, vault_chain},
};
use axum::{body::Body, http::Response};
use envden_core::{
    adapters::storage::{IStateWrite, TCommitResult, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{chain::filter_repair_reports, protocol::*};
use serde_json::{Value, json};
use std::collections::BTreeSet;

fn commit_response(result: TCommitResult, conflict_status: bool) -> Response<Body> {
    let moved = matches!(result, TCommitResult::HeadMoved { .. });
    let value = match result {
        TCommitResult::Committed => json!({"kind":"committed"}),
        TCommitResult::RetryOfCommitted => json!({"kind":"retry-of-committed"}),
        TCommitResult::HeadMoved { head } => match head {
            Some(head) => json!({"kind":"head-moved","head":text(&head)}),
            None => json!({"kind":"head-moved"}),
        },
    };

    response(
        if moved && conflict_status { 409 } else { 200 },
        "application/json",
        value.to_string(),
    )
}

pub(crate) fn recovery_route(
    options: &IAppOptions,
    auth: &IAuth,
    path: &str,
    body: &[u8],
) -> Result<Option<Response<Body>>> {
    let id = &auth.request.vault_id;
    let storage = options.storage.as_ref();
    let parts: Vec<_> = path.split('/').collect();
    if path == "/v1/move/sk-pub" {
        require_gate(options, auth, true)?;
        if storage.vault(id)?.is_some_and(|v| v.sk_refused) {
            return Err(EnvdenError::new(
                ErrorCode::RecoveryKitRequired,
                "Replace recovery kit before moving",
            ));
        }
        let bytes = storage
            .state(id, TStateKind::SkPub, &[])?
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Missing public key"))?;
        return Ok(Some(Response::new(Body::from(bytes))));
    }
    if !matches!(parts.get(2), Some(&"move" | &"repair")) {
        return Ok(None);
    }
    let repair = parts[2] == "repair";
    if repair {
        super::require_repair(options, auth)?;
    } else {
        require_move(options, auth)?;
    }
    if let ["", "v1", _, "material", kind, hash] = parts.as_slice() {
        super::store_material(options, auth, kind, &binary(hash, Some(32))?, body)?;
        return Ok(Some(response(
            200,
            "application/json",
            "{\"kind\":\"uploaded\"}",
        )));
    }
    let result=match parts.get(3) {
        Some(&"history")=>{let swap:ISwap=input(||decode(body))?;commit_response(super::upload_history(options,auth,&swap,&h("swap",body),true)?,false)},
        Some(&"chain")=>{
            let swaps = input(|| {
            let mut reader=Reader::new(body);
            let count=reader.u32()?;
            if count>100000 {return Err(EnvdenError::new(ErrorCode::InvalidInput,"Invalid history"));}
            let swaps=(0..count).map(|_|ISwap::read(&mut reader)).collect::<Result<Vec<_>>>()?;
            reader.end()?;
            Ok(swaps)
            })?;
            commit_response(super::upload_chain(options,auth,&swaps)?,false)
        },
        Some(&"status") if repair=>{let restored=storage.vault(id)?.and_then(|v|v.restored).expect("authorized repair");response(200,"application/json",json!({"restoredHead":text(&restored.restored_head),"repairId":text(&restored.finish_progress.unwrap_or_default())}).to_string())},
        Some(&"reports") if repair=>response(200,"application/json",json!({"objects":storage.states(id,TStateKind::RepairReport)?.iter().map(|r|text(&r.bytes)).collect::<Vec<_>>()}).to_string()),
        Some(&"report") if repair=>{
            let report:ISigned<IRepairReport>=input(||decode(body))?;
            let restored=storage.vault(id)?.and_then(|v|v.restored).expect("authorized repair");
            let headers=if storage.header(id,&report.body.head)?.is_some() {BTreeSet::from([report.body.head])} else {BTreeSet::new()};
            let reports=filter_repair_reports(std::slice::from_ref(&report),&fixed(&restored.finish_progress.unwrap_or_default())?,&vault_chain(&options.storage,id)?.1,&headers);
            if reports.is_empty() || report.body.signer!=auth.request.device {return Err(EnvdenError::new(ErrorCode::InvalidData,"Invalid repair report"));}
            storage.write_state(id,&[IStateWrite {kind:TStateKind::RepairReport,key:report.body.signer.to_vec(),bytes:Some(body.to_vec())}])?;
            response(200,"application/json","{\"kind\":\"stored\"}")
        },
        Some(&"finish") if repair=>{
            let raw:Value=serde_json::from_slice(body).map_err(|_|EnvdenError::new(ErrorCode::InvalidInput,"Invalid JSON"))?;
            let bytes=binary(raw["swap"].as_str().unwrap_or(""),None)?;
            let swap:ISwap=input(||decode(&bytes))?;
            if swap.header.body.op!=12 {return Err(EnvdenError::new(ErrorCode::InvalidInput,"Repair close required"));}
            let message=raw["message"].as_str().unwrap_or("");
            match raw["kind"].as_str() {Some("login")=>{finish_login(options,auth,"unlock",message)?;},Some("registration")=>{finish_registration(options,auth,message)?;},_=>return Err(EnvdenError::new(ErrorCode::InvalidInput,"Invalid input"))};
            commit_response(commit_swap(options,auth,&swap,&h("swap",&bytes),None)?,true)
        },
        _=>return Ok(None),
    };

    Ok(Some(result))
}
