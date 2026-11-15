use super::{
    fixture,
    support::{entry, opts, repo},
};
use crate::{links::approval::checkout_value, *};
use serde_json::json;
use std::fs;

fn reconciliation(repair: bool, consume: bool) {
    use std::{cell::Cell, collections::HashSet, rc::Rc};
    use sync::local::{
        conflicts::IConflictTarget, files::base_path, reconciliation::file::reconcile_file,
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
        c.options.choose = Some(Rc::new(move |_| {
            record.set(record.get() + 1);
            Ok("keep-mine".into())
        }));
        let result = reconcile_file(
            &mut c,
            &[target],
            store.to_str().unwrap(),
            Some(&e),
            &repairs,
        );
        assert_eq!(result.unwrap().1, usize::from(repair));
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
            let again = reconcile_file(
                &mut c,
                &[target],
                store.to_str().unwrap(),
                Some(&e),
                &HashSet::new(),
            );
            assert_eq!(again.unwrap().1, 0);
        }
    }
}

#[test]
fn detached_chooser() {
    reconciliation(false, false);
}

#[test]
fn aligned_conflicts() { reconciliation(true, false); }

#[test]
fn repair_marker_is_consumed() { reconciliation(true, true); }
