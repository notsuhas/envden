use super::*;
use crate::sync::fixture;
#[cfg(test)]
mod cases {
    use super::*;
    struct NeverCall;
    impl ITransport for NeverCall {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            panic!("unconfigured sync must not request the server")
        }
    }
    #[test]
    fn piped_push_requires_yes_before_loading_state() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().to_owned()),
            dir.path().to_owned(),
            || 1,
        );
        for (pushing, yes, message) in [
            (
                true,
                false,
                "Without a terminal, push needs --yes to confirm the changes",
            ),
            (true, true, crate::state::NOT_SET_UP),
            (false, false, crate::state::NOT_SET_UP),
        ] {
            let options = ISyncOptions {
                unlock: None,
                now: std::rc::Rc::new(adapters.now),
                cwd: None,
                all: true,
                yes,
                interactive: false,
                choose: None,
                confirm: None,
                report: None,
            };
            assert_eq!(
                sync(&adapters, options, Rc::new(NeverCall), pushing)
                    .unwrap_err()
                    .message,
                message
            );
        }
    }
}

#[cfg(unix)]
#[test]
fn pull_saves_selection_and_two_checkpoints() {
    use std::{fs::File, os::unix::fs::MetadataExt};
    let (_dir, a, server, _) = fixture::fixture();
    let path = a.home.join("state/device.json");
    let initial = File::open(&path).unwrap();
    let revisions = Rc::new(RefCell::new(vec![initial]));
    let observed = revisions.clone();
    let options = ISyncOptions {
        now: Rc::new(move || {
            let current = File::open(&path).unwrap();
            let mut revisions = observed.borrow_mut();
            if current.metadata().unwrap().ino()
                != revisions.last().unwrap().metadata().unwrap().ino()
            {
                revisions.push(current);
            }
            1800000000000
        }),
        unlock: None,
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    let result = sync(&a, options, server, false).unwrap();
    assert_eq!(result["kind"], "pulled");
    assert_eq!(
        revisions.borrow().len() - 1,
        3,
        "pull must save selection and two reconciliation checkpoints"
    );
}
