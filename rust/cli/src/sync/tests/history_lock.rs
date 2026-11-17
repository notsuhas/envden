use super::fixture;
use crate::{
    client::{IHttpRequest, IHttpResponse, ITransport},
    history::list::run::file_history,
    sync::remote::context::ISyncOptions,
};
use envden_core::errors::Result;
use std::{path::PathBuf, rc::Rc};
struct Observe {
    server: Rc<fixture::Server>,
    home: PathBuf,
}
impl ITransport for Observe {
    fn fetch(&self, r: IHttpRequest) -> Result<IHttpResponse> {
        assert!(
            self.home.join("state/write.lock").exists(),
            "history must hold state lock during requests"
        );
        self.server.fetch(r)
    }
}
#[test]
fn history_holds_lock_through_network_reads() {
    let (_dir, a, server, _) = fixture::fixture();
    let options = ISyncOptions {
        unlock: None,
        now: std::rc::Rc::new(a.now),
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    file_history(
        &a,
        options,
        Rc::new(Observe {
            server: server.clone(),
            home: a.home.clone(),
        }),
        None,
    )
    .unwrap();
    assert!(
        server
            .requests
            .borrow()
            .iter()
            .any(|path| path.contains("/v1/keyrings/")),
        "history must verify current keyring even at an unchanged head"
    );
    assert!(!a.home.join("state/write.lock").exists());
}

struct CorruptKeyring(Rc<fixture::Server>);

impl ITransport for CorruptKeyring {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let corrupt = request.url.path().starts_with("/v1/keyrings/");
        let mut response = self.0.fetch(request)?;
        if corrupt {
            response.body[0] ^= 1;
        }

        Ok(response)
    }
}

#[test]
fn history_rejects_changed_remote_keyring_at_unchanged_head() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let options = ISyncOptions {
        unlock: None,
        now: Rc::new(adapters.now),
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    let error =
        file_history(&adapters, options, Rc::new(CorruptKeyring(server)), None).unwrap_err();
    assert_eq!(error.message, "Keyring hash mismatch");
}

#[test]
fn pending_history_refuses_before_selection_or_network() {
    pending_history_guard(false);
}

#[test]
fn pending_history_restore_refuses_before_selection_or_network() {
    pending_history_guard(true);
}

fn pending_history_guard(restore: bool) {
    let (_dir, adapters, server, _) = fixture::fixture();
    let mut state = crate::state::repository::load_state(&adapters.home)
        .unwrap()
        .unwrap();
    state["creationPending"] = serde_json::json!("pending-signed-swap");
    crate::state::repository::save_state(&adapters.home, &state, &adapters.now).unwrap();
    let options = ISyncOptions {
        unlock: None,
        now: Rc::new(adapters.now),
        cwd: None,
        all: true,
        yes: true,
        interactive: true,
        choose: None,
        confirm: None,
        report: None,
    };
    server.requests.borrow_mut().clear();
    let error = if restore {
        crate::history::restore::run::restore(&adapters, options, server.clone(), "missing.env", 1)
    } else {
        file_history(&adapters, options, server.clone(), Some("missing.env"))
    }
    .unwrap_err();
    assert_eq!(error.code, envden_core::errors::ErrorCode::Conflict);
    assert_eq!(
        error.message,
        "Setup didn't finish. Run envden setup again to finish it"
    );
    assert!(server.requests.borrow().is_empty());
}
