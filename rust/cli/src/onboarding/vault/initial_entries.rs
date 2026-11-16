use crate::{
    adapters::IAdapters,
    client::{IClient, text},
    sync::local::files::base_path,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;
#[cfg(test)]
use std::path::PathBuf;

type TBases = super::bases::IBases;

pub(super) fn entries(
    adapters: &IAdapters,
    state: &Value,
    client: &IClient,
    vault_id: [u8; 32],
    key: &[u8; 32],
    id: &[u8; 32],
) -> Result<(p::IFiles, TBases)> {
    let mut files = p::IFiles { entries: vec![] };
    let mut bases = super::bases::IBases::default();
    for link in state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|v| v["localOnly"] != true)
    {
        let checkout = state["approved"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|c| c["root"] == link["root"])
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::Unauthorized, "Checkout approval required")
            })?;
        let repo = checkout["repoId"].as_str().unwrap_or_default();
        let repo = state["aliases"][repo].as_str().unwrap_or(repo);
        let path = link["path"].as_str().unwrap_or_default();
        let store = link["store"].as_str().unwrap_or_default();
        let file_id = p::file_id(id, repo, path)?;
        let content = std::fs::read(store)
            .map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "File read failed", e))?;
        if let Some(notice) =
            crate::sync::local::validation::size::file_size_notice(path, Some(&content))
        {
            eprintln!("{notice}");
            continue;
        }
        bases.set(
            base_path(
                &adapters.home,
                store,
                if link["mode"] == "copy" {
                    link["root"].as_str()
                } else {
                    None
                },
            ),
            content.clone(),
        );
        if files.entries.iter().any(|v| v.file_id == file_id) {
            continue;
        }
        let context = p::IFileContext {
            vault_id: vault_id,
            epoch: 1,
            file_id,
            version: 1,
        };
        let blob = p::seal_file(
            &p::IFile {
                repo_id: repo.into(),
                path: path.into(),
                content,
            },
            key,
            &context,
            &p::random_bytes(),
        )?;
        let blob_hash = p::h("blob", &blob);
        client.request_bytes(&format!("/v1/blobs/{}", text(&blob_hash)), "PUT", &blob)?;
        files.entries.push(p::IFileEntry {
            file_id,
            version: 1,
            epoch: 1,
            state: 1,
            blob_hash,
            name: p::seal_file_name(
                &p::IFileName {
                    repo_id: repo.into(),
                    path: path.into(),
                },
                key,
                &context,
                &p::random_bytes(),
            )?,
        });
    }
    Ok((files, bases))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        client::{IHttpRequest, IHttpResponse, ITransport},
        identity::device_identity,
    };
    use serde_json::json;
    use std::rc::Rc;

    struct Upload {
        store: PathBuf,
        keys: p::IDeviceKeys,
    }
    impl ITransport for Upload {
        fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
            if request.url.path() == "/v1/hello" {
                let challenge = request
                    .url
                    .query_pairs()
                    .find(|(k, _)| k == "challenge")
                    .unwrap()
                    .1;
                let hello = p::build_hello(
                    p::IServerHello {
                        challenge: p::fixed(&crate::client::binary(&challenge)?)?,
                        host: "server.test".into(),
                        server_sign_pub: self.keys.recovery.obj_pub,
                        app_version: "1.0.0".into(),
                        min_client: "0.0.0".into(),
                        protocols: vec![1],
                    },
                    &self.keys.recovery.obj_sk,
                )?;
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: serde_json::to_vec(&json!({"hello":text(&p::encode(&hello)?)})).unwrap(),
                });
            }
            assert_eq!(request.method, "PUT");
            std::fs::write(&self.store, b"second").unwrap();
            Ok(IHttpResponse {
                status: 200,
                location: None,
                body: vec![],
            })
        }
    }

    #[test]
    fn initial_entries_validate_names_before_reading_and_overwrite_duplicate_bases() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let identity =
            device_identity(&*adapters.keychain, &adapters.home, "test", false, 42).unwrap();
        let store = dir.path().join("env");
        let keys = p::generate_device_keys(p::random_bytes);
        let pin = p::server_pin(&keys.recovery.obj_pub).unwrap();
        let mut client = super::super::connection::connection(
            &adapters,
            "http://server.test",
            pin,
            [1; 32],
            &identity,
        );
        client.options.transport = Rc::new(Upload {
            store: store.clone(),
            keys,
        });
        let link = json!({"root":"/repo","path":".env","store":store});
        let mut state = json!({"links":[link.clone(),link],"approved":[{"root":"/repo","repoId":"repo"}],"aliases":{}});
        std::fs::write(&store, b"first").unwrap();
        let (files, bases) =
            entries(&adapters, &state, &client, [1; 32], &[3; 32], &[4; 32]).unwrap();
        assert_eq!(files.entries.len(), 1);
        assert_eq!(bases.as_entries().len(), 1);
        assert_eq!(bases.as_entries().iter().next().unwrap().1, b"second");
        state["links"] =
            json!([{"root":"/repo","path":"../bad","store":dir.path().join("missing")}]);
        assert_eq!(
            entries(&adapters, &state, &client, [1; 32], &[3; 32], &[4; 32])
                .unwrap_err()
                .code,
            ErrorCode::InvalidData
        );
    }
}
