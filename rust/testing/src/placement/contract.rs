use crate::fixtures::with_directory;
use envden_core::adapters::*;
use std::fs;
pub fn placement_contract(factory: impl Fn(&str, Option<&str>) -> Box<dyn IPlacementAdapter>) {
    with_directory(|root| {
        let adapter = factory(root.to_str().unwrap(), None);
        let store = root.join("store");
        let checkout = root.join("nested/.env");
        fs::write(&store, "A=1\n").unwrap();
        let store = store.to_str().unwrap();
        let checkout = checkout.to_str().unwrap();
        if !adapter.supported(root.to_str().unwrap()).unwrap() {
            assert!(
                adapter
                    .place(store, checkout, Some(&|_| Ok(())), None)
                    .is_err()
            );
            return;
        }
        assert_eq!(
            adapter.inspect(store, checkout).unwrap(),
            TPlacementState::Missing
        );
        for _ in 0..2 {
            adapter
                .place(store, checkout, Some(&|_| Ok(())), None)
                .unwrap();
            assert_eq!(fs::read_to_string(checkout).unwrap(), "A=1\n");
            assert_eq!(
                adapter.inspect(store, checkout).unwrap(),
                TPlacementState::Linked
            );
        }
        adapter.remove(Some(store), checkout).unwrap();
        adapter.remove(Some(store), checkout).unwrap();
        assert_eq!(
            adapter.inspect(store, checkout).unwrap(),
            TPlacementState::Missing
        );
    });
    with_directory(|root| {
        let adapter = factory(root.to_str().unwrap(), None);
        let store = root.join("store");
        let checkout = root.join(".env");
        fs::write(&store, "A=1\n").unwrap();
        fs::write(&checkout, "A=1\n").unwrap();
        let store = store.to_str().unwrap();
        let checkout = checkout.to_str().unwrap();
        assert_eq!(
            adapter.inspect(store, checkout).unwrap(),
            if adapter.mode() == TPlacementMode::Link {
                TPlacementState::Relinkable
            } else {
                TPlacementState::Linked
            }
        );
        fs::write(checkout, "A=2\n").unwrap();
        assert_eq!(
            adapter.inspect(store, checkout).unwrap(),
            TPlacementState::Detached
        );
    });
    with_directory(|root| {
        let checkout = root.join("checkout");
        fs::create_dir(&checkout).unwrap();
        let adapter = factory(checkout.to_str().unwrap(), None);
        let store = root.join("store");
        fs::write(&store, "A=1\n").unwrap();
        let store = store.to_str().unwrap();
        let outside = root.join("outside");
        let outside = outside.to_str().unwrap();
        assert!(
            adapter
                .place(store, outside, Some(&|_| Ok(())), None)
                .is_err()
        );
        assert!(adapter.inspect(store, outside).is_err());
        assert!(adapter.remove(Some(store), outside).is_err());
        fs::create_dir(checkout.join(".env")).unwrap();
        assert!(
            adapter
                .place(
                    store,
                    checkout.join(".env").to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None
                )
                .is_err()
        );
    });
    placement_links_contract(factory);
}
fn placement_links_contract(factory: impl Fn(&str, Option<&str>) -> Box<dyn IPlacementAdapter>) {
    #[cfg(unix)]
    with_directory(|root| {
        use std::os::unix::fs::symlink;
        let checkout = root.join("checkout");
        let backups = root.join("backups");
        fs::create_dir(&checkout).unwrap();
        let adapter = factory(checkout.to_str().unwrap(), Some(backups.to_str().unwrap()));
        if !adapter.supported(checkout.to_str().unwrap()).unwrap() {
            return;
        }
        let store = root.join("store");
        let unrelated = root.join("unrelated");
        let destination = checkout.join(".env");
        fs::write(&store, "NEW=1").unwrap();
        fs::write(&unrelated, "KEEP=1").unwrap();
        symlink(&unrelated, &destination).unwrap();
        let store = store.to_str().unwrap();
        let dest = destination.to_str().unwrap();
        assert!(adapter.place(store, dest, Some(&|_| Ok(())), None).is_err());
        assert!(
            adapter
                .place(
                    store,
                    dest,
                    Some(&|_| Ok(())),
                    Some(root.join("other").to_str().unwrap())
                )
                .is_err()
        );
        assert_eq!(fs::read_to_string(&unrelated).unwrap(), "KEEP=1");
        adapter
            .place(
                store,
                dest,
                Some(&|_| Ok(())),
                Some(unrelated.to_str().unwrap()),
            )
            .unwrap();
        assert_eq!(
            adapter.inspect(store, dest).unwrap(),
            TPlacementState::Linked
        );
        assert_eq!(fs::read_to_string(dest).unwrap(), "NEW=1");
        assert_eq!(fs::read_to_string(&unrelated).unwrap(), "KEEP=1");
        fs::remove_file(dest).unwrap();
        symlink(root, checkout.join("parent")).unwrap();
        assert!(
            adapter
                .place(
                    store,
                    checkout.join("parent/.env").to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None
                )
                .is_err()
        );
        fs::write(dest, "OLD=1").unwrap();
        adapter.place(store, dest, Some(&|_| Ok(())), None).unwrap();
        let names: Vec<_> = fs::read_dir(backups).unwrap().collect();
        assert_eq!(names.len(), 1);
        assert_eq!(
            fs::read_to_string(names[0].as_ref().unwrap().path()).unwrap(),
            "OLD=1"
        );
    });
}
