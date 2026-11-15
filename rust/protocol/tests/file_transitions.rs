use envden_protocol::{chain::changed_files, protocol::*};

#[test]
fn transitions_retain_ids_increase_versions_and_bind_names_and_epochs() {
    let old = IFileEntry {
        file_id: [1; 32],
        version: 2,
        epoch: 2,
        state: 1,
        blob_hash: [2; 32],
        name: vec![3; 32],
    };
    let next = IFileEntry {
        version: 3,
        epoch: 3,
        name: vec![4; 32],
        ..old.clone()
    };
    let before = IFiles {
        entries: vec![old.clone()],
    };
    let after = |entry| IFiles {
        entries: vec![entry],
    };
    assert!(
        changed_files(&before, &before, 2, 3, None)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        changed_files(&before, &after(next.clone()), 2, 3, Some(1)).unwrap(),
        vec![next.clone()]
    );
    assert!(changed_files(&before, &IFiles { entries: vec![] }, 2, 3, None).is_err());
    for entry in [
        IFileEntry {
            version: 1,
            ..next.clone()
        },
        IFileEntry {
            version: 2,
            ..next.clone()
        },
        IFileEntry {
            epoch: 1,
            ..next.clone()
        },
        IFileEntry {
            epoch: 4,
            ..next.clone()
        },
        IFileEntry {
            name: old.name.clone(),
            ..next.clone()
        },
    ] {
        assert!(changed_files(&before, &after(entry), 2, 3, None).is_err());
    }
    assert!(
        changed_files(
            &before,
            &after(IFileEntry {
                epoch: 2,
                ..next.clone()
            }),
            2,
            3,
            Some(1)
        )
        .is_err()
    );
    assert!(
        changed_files(
            &IFiles { entries: vec![] },
            &after(IFileEntry {
                epoch: 1,
                ..next.clone()
            }),
            2,
            3,
            None
        )
        .is_err()
    );
    assert!(
        changed_files(
            &before,
            &after(IFileEntry {
                state: 3,
                ..next.clone()
            }),
            2,
            3,
            Some(1)
        )
        .is_err()
    );
    let recovered = IFileEntry { state: 3, ..next };
    assert_eq!(
        changed_files(&before, &after(recovered.clone()), 2, 3, Some(11)).unwrap(),
        vec![recovered.clone()]
    );
    assert!(
        changed_files(
            &IFiles { entries: vec![] },
            &after(recovered.clone()),
            2,
            3,
            Some(11)
        )
        .is_err()
    );
    for state in [2, 4] {
        assert!(
            changed_files(
                &after(IFileEntry {
                    state,
                    blob_hash: [0; 32],
                    ..old.clone()
                }),
                &after(recovered.clone()),
                2,
                3,
                Some(11)
            )
            .is_err()
        );
    }
    assert!(
        changed_files(
            &before,
            &after(IFileEntry {
                epoch: 2,
                ..recovered
            }),
            2,
            3,
            Some(11)
        )
        .is_err()
    );
}
