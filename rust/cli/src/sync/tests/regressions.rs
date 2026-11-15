use super::{
    fixture,
    support::{entry, opts, repo},
};
use crate::{links::approval::checkout_value, *};
use serde_json::json;
use std::fs;

fn reconciliation(repair: bool, consume: bool, journal: bool, interrupted: bool) {
    use std::{cell::Cell, collections::HashSet, rc::Rc};
    use sync::local::{
        conflicts::IConflictTarget, files::base_path,
        reconciliation::file::reconcile_file_with_choice,
    };
    {
        let (_d, a, server, _) = fixture::fixture();
        let root = repo(&a);
        let mut c = sync::remote::context::sync_context(&a, opts(&a), server).unwrap();
        let checked = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
        c.state["approved"] = json!([checkout_value(&checked)]);
        let store = store::store_path(&a.home, "github.com/test/review", ".env").unwrap();
        fs::create_dir_all(store.parent().unwrap()).unwrap();
        let mine = if repair {
            b"A=1\nB=0\n".as_slice()
        } else {
            b"A=1\n".as_slice()
        };
        let remote = if repair {
            b"A=0\nB=2\n".as_slice()
        } else {
            b"A=2\n".as_slice()
        };
        fs::write(&store, mine).unwrap();
        let target = IConflictTarget {
            root: root.to_str().unwrap().into(),
            path: ".env".into(),
            store: store.to_str().unwrap().into(),
            mode: "link".into(),
            local_only: None,
        };
        c.state["links"] = json!([{"root":root,"path":".env","store":store,"mode":"link"}]);
        let e = entry(&c, ".env", 2, remote);
        c.checkpoint.files.entries = vec![e.clone()];
        let mut repairs = HashSet::new();
        if repair {
            std::os::unix::fs::symlink(&store, root.join(".env")).unwrap();
            let prev = entry(&c, ".env", 1, b"A=0\nB=0\n");
            let base = base_path(&a.home, store.to_str().unwrap(), None);
            state::files::atomic_write(&base, b"A=0\nB=0\n", (a.now)()).unwrap();
            state::files::atomic_write(
                &sync::local::reconciliation::operation::deletion::suffix(&base, ".entry"),
                client::text(&envden_protocol::protocol::encode(&prev).unwrap()).as_bytes(),
                (a.now)(),
            )
            .unwrap();
            repairs.insert(envden_protocol::protocol::base32(&e.file_id));
            sync::remote::repairs::save_pending_repairs(
                &a.home,
                &repairs.iter().cloned().collect::<Vec<_>>(),
                (a.now)(),
            )
            .unwrap();
        } else {
            fs::write(root.join(".env"), b"A=3\n").unwrap();
        }
        let calls = Rc::new(Cell::new(0));
        let record = calls.clone();
        if interrupted {
            let exclude = root.join(".git/info/exclude");
            c.options.report = Some(Rc::new(move |_| {
                let _ = fs::remove_file(&exclude);
                fs::create_dir_all(&exclude).unwrap();
            }));
        }
        c.options.choose = Some(Rc::new(move |_| {
            record.set(record.get() + 1);
            Ok(if interrupted {
                "take-server"
            } else {
                "keep-mine"
            }
            .into())
        }));
        let result = reconcile_file_with_choice(
            &mut c,
            &[target],
            store.to_str().unwrap(),
            Some(&e),
            &repairs,
            None,
        );
        if interrupted {
            assert!(result.is_err());
            let pending = sync::local::reconciliation::operation::deletion::suffix(
                &base_path(&a.home, store.to_str().unwrap(), None),
                ".pending",
            );
            let operation: serde_json::Value =
                serde_json::from_slice(&fs::read(pending).unwrap()).unwrap();
            assert_eq!(operation["written"][0], true);
            return;
        }
        assert_eq!(result.unwrap().1, usize::from(repair));
        if journal {
            assert!(a.home.join("state/placement.json").exists());
        }
        if !repair {
            assert_eq!(calls.get(), 1);
        }
        if consume {
            assert!(
                sync::remote::repairs::pending_repairs(&a.home)
                    .unwrap()
                    .is_empty()
            );
            return;
        }
        if repair {
            fs::write(&store, remote).unwrap();
            let target: IConflictTarget =
                serde_json::from_value(c.state["links"][0].clone()).unwrap();
            let again = reconcile_file_with_choice(
                &mut c,
                &[target],
                store.to_str().unwrap(),
                Some(&e),
                &HashSet::new(),
                None,
            );
            assert_eq!(again.unwrap().1, 0);
        }
    }
}

#[test]
fn detached_chooser() {
    reconciliation(false, false, false, false);
}

#[test]
fn aligned_conflicts() {
    reconciliation(true, false, false, false);
}

#[test]
fn repair_marker_is_consumed() {
    reconciliation(true, true, false, false);
}

#[test]
fn placement_writes_a_journal() {
    reconciliation(false, false, true, false);
}

#[test]
fn interrupted_placement_marks_completed_store_write() {
    reconciliation(false, false, false, true);
}

#[test]
fn missing_unpublished_link_content_is_held_back() {
    use std::collections::HashSet;
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let mut c = sync::remote::context::sync_context(&a, opts(&a), server).unwrap();
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    let store = store::store_path(&a.home, "github.com/test/review", ".env").unwrap();
    c.state["approved"] = json!([checkout_value(&checkout)]);
    c.state["links"] = json!([{"root":root,"path":".env","store":store,"mode":"link"}]);
    let result = sync::local::reconcile::reconcile(
        &mut c,
        &HashSet::from(["github.com/test/review".into()]),
        &HashSet::new(),
    )
    .unwrap();
    assert_eq!(result.conflicts, 1);
    assert!(result.failed_stores.contains(store.to_str().unwrap()));
}
