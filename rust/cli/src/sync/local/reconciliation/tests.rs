use super::{
    decision::{
        IContent, TContentAction, derive_content_action, derive_store_source, needs_conflict,
    },
    file_decision::{IFileDecisionInput, derive_file_decision},
    sides::{ICopy, ISidesInput, TLocalContent, TServer},
};

const A: &[u8] = &[1];
const B: &[u8] = &[2];
const C: &[u8] = &[3];

fn decision<'a>(
    store: Option<&'a [u8]>,
    previous: Option<&'a [u8]>,
    server: Option<&'a [u8]>,
    copies: Vec<ICopy<'a>>,
) -> super::file_decision::IFileDecision<'a> {
    derive_file_decision(IFileDecisionInput {
        content: IContent {
            previous,
            server,
            ..Default::default()
        },
        sides: ISidesInput {
            store_before_restore: store,
            recorded: None,
            previous,
            server: TServer::Absent,
            copies,
            pending_removal: false,
        },
        tracked: true,
        published: true,
        deleting: false,
        store,
    })
}

#[test]
fn reference_store_decisions() {
    for (store, previous, server, next) in [(A, A, A, A), (A, A, B, B), (A, B, B, A), (B, A, B, B)]
    {
        let result = decision(Some(store), Some(previous), Some(server), vec![]);
        assert_eq!(result.sides.local, TLocalContent::Content(Some(store)));
        assert_eq!(result.sides.mine, Some(store));
        assert_eq!(result.action, TContentAction::Write(Some(next)));
    }
    assert_eq!(
        decision(Some(A), Some(B), Some(C), vec![]).action,
        TContentAction::Choose
    );
}

#[test]
fn reference_copies_and_detached_versions() {
    for (bytes, base, tracked, link, expected) in [
        (
            Some(A),
            Some(A),
            true,
            false,
            TLocalContent::Content(Some(B)),
        ),
        (
            Some(C),
            Some(A),
            true,
            false,
            TLocalContent::Conflict(vec![Some(B), Some(C)]),
        ),
        (
            Some(C),
            Some(A),
            false,
            false,
            TLocalContent::Conflict(vec![Some(B), Some(C)]),
        ),
        (
            Some(C),
            None,
            true,
            false,
            TLocalContent::Conflict(vec![Some(B), Some(C)]),
        ),
        (
            Some(C),
            Some(A),
            true,
            true,
            TLocalContent::Conflict(vec![Some(B), Some(C)]),
        ),
        (
            Some(A),
            Some(B),
            true,
            true,
            TLocalContent::Content(Some(A)),
        ),
        (
            Some(C),
            Some(B),
            true,
            true,
            TLocalContent::Content(Some(C)),
        ),
        (
            Some(B),
            Some(A),
            true,
            true,
            TLocalContent::Content(Some(B)),
        ),
        (
            Some(A),
            Some(B),
            false,
            true,
            TLocalContent::Conflict(vec![Some(B), Some(A)]),
        ),
        (None, Some(A), true, false, TLocalContent::Content(Some(B))),
    ] {
        let mut input = IFileDecisionInput {
            content: IContent {
                previous: Some(A),
                server: Some(B),
                recorded: Some(B),
                ..Default::default()
            },
            sides: ISidesInput {
                store_before_restore: Some(B),
                recorded: Some(B),
                previous: Some(A),
                server: TServer::Absent,
                copies: vec![],
                pending_removal: false,
            },
            tracked: true,
            published: true,
            deleting: false,
            store: Some(B),
        };
        input.sides.copies.push(ICopy {
            bytes,
            base,
            tracked,
            link,
            historical: false,
        });
        assert_eq!(derive_file_decision(input).sides.local, expected);
    }
}

mod decisions;
mod resolution;
mod sides;
