use super::*;
use serde_json::json;

use crate::{
    client::{IHttpRequest, IHttpResponse, ITransport},
    sync::remote::{
        context::{ISyncOptions, sync_context},
        upload::{seal, upload_changes},
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::{collections::HashSet, fs, rc::Rc};

#[path = "../../../tests/fixture.rs"]
mod fixture;

struct Transport {
    inner: Rc<dyn ITransport>,
}

impl ITransport for Transport {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        if !request.url.path().starts_with("/v1/blobs/") && request.url.path() != "/v1/swap" {
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
fn deletion_preserves_copies_whose_bases_were_not_uploaded() {
    let home = Path::new("/home");
    let mut places = IPlaces::default();
    places.record(home, "/store", Some("/one"), true);
    for (root, local, expected) in [
        ("/one", false, false),
        ("/two", false, true),
        ("/one", true, true),
    ] {
        let link =
            json!({"root":root,"path":".env","store":"/store","mode":"copy","localOnly":local});
        assert_eq!(keep_link(&link, &places, home), expected);
    }
}

#[test]
fn deletion_drops_links_with_aliased_store_paths() {
    let (_dir, a, server, _) = fixture::fixture();
    let options = ISyncOptions {
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
    let mut c = sync_context(&a, options, server.clone()).unwrap();
    c.client.options.transport = Rc::new(Transport { inner: server });
    let repo = "github.com/test/review";
    let root = a.user_home.join("repo");
    fs::create_dir_all(&root).unwrap();
    let store = crate::store::store_path(&a.home, "github.com/old/review", ".env").unwrap();
    assert_ne!(
        store,
        crate::store::store_path(&a.home, repo, ".env").unwrap()
    );
    c.state["aliases"] = json!({"github.com/old/review":repo});
    c.state["approved"] = json!([{"root":root,"repoId":"github.com/old/review"}]);
    c.state["links"] = json!([{"root":root,"path":".env","store":store,"mode":"copy"}]);
    let id = p::file_id(&c.checkpoint.id_key, repo, ".env").unwrap();
    let entry = seal::seal(&c, repo, ".env", id, 1, Some(b"A=1\n")).unwrap();
    let encoded = crate::client::text(&p::encode(&entry).unwrap());
    crate::sync::local::applied::mark_applied_entry(
        &a.home,
        &encoded,
        Some(store.to_str().unwrap()),
        (a.now)(),
    )
    .unwrap();
    crate::sync::local::reconciliation::operation::deletion::request_deletion(
        &a.home,
        store.to_str().unwrap(),
        true,
        Some(&encoded),
        None,
        (a.now)(),
    )
    .unwrap();
    c.checkpoint.files.entries = vec![entry];
    assert_eq!(
        upload_changes(&mut c, &HashSet::from([repo.into()]), &HashSet::new()).unwrap(),
        1
    );
    assert!(
        c.state["links"].as_array().unwrap().is_empty(),
        "deleted base must remove its aliased link"
    );
}
