use super::*;
use crate::client::{IHttpRequest, IHttpResponse, ITransport, binary};
use envden_core::errors::{EnvdenError, ErrorCode};
use serde_json::{Value, json};
use std::{fs, rc::Rc};

#[path = "../../tests/fixture.rs"]
mod fixture;

struct Transport {
    inner: Rc<dyn ITransport>,
}

impl ITransport for Transport {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        if request.url.path() == "/v1/swap" {
            return Err(EnvdenError::new(ErrorCode::HeadMoved, "Head moved"));
        }
        if !request.url.path().starts_with("/v1/blobs/") {
            return self.inner.fetch(request);
        }
        Ok(IHttpResponse {
            status: 200,
            location: None,
            body: vec![],
        })
    }
}

#[test]
fn attempt_entries_follow_file_id_order_instead_of_link_order() {
    let (_dir, a, server, _) = fixture::fixture();
    let options = super::super::context::ISyncOptions {
        now: Rc::new(a.now),
        unlock: None,
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    let mut c = super::super::context::sync_context(&a, options, server.clone()).unwrap();
    let repo = "github.com/test/review";
    let root = a.user_home.join("repo");
    fs::create_dir_all(&root).unwrap();
    c.state["approved"] = json!([{"root":root,"repoId":repo}]);
    let mut paths = [".env", ".env.local"];
    paths.sort_by_key(|path| {
        std::cmp::Reverse(p::file_id(&c.checkpoint.id_key, repo, path).unwrap())
    });
    let links: Vec<_> = paths
        .iter()
        .map(|path| {
            let store = a.home.join("store").join(path);
            fs::create_dir_all(store.parent().unwrap()).unwrap();
            fs::write(&store, b"A=1\n").unwrap();
            json!({"root":root,"path":path,"store":store,"mode":"copy"})
        })
        .collect();
    c.state["links"] = json!(links);
    c.client.options.transport = Rc::new(Transport { inner: server });
    assert_eq!(
        upload_changes(&mut c, &HashSet::from([repo.into()]), &HashSet::new())
            .unwrap_err()
            .code,
        ErrorCode::HeadMoved
    );
    let records: Vec<_> = fs::read_dir(a.home.join("state/attempts"))
        .unwrap()
        .collect();
    assert_eq!(records.len(), 1);
    let record: Value =
        serde_json::from_slice(&fs::read(records[0].as_ref().unwrap().path()).unwrap()).unwrap();
    let ids: Vec<_> = record["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            p::decode::<p::IFileEntry>(&binary(entry.as_str().unwrap()).unwrap())
                .unwrap()
                .file_id
        })
        .collect();
    assert_eq!(ids.len(), 2);
    assert!(
        ids[0] < ids[1],
        "attempt entries must use sorted manifest order"
    );
}
