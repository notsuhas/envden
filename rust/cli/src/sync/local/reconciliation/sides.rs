#[derive(Clone, Copy)]
pub enum TServer<'a> {
    Absent,
    Live(&'a [u8]),
    Tombstone,
}

pub struct ICopy<'a> {
    pub bytes: Option<&'a [u8]>,
    pub base: Option<&'a [u8]>,
    pub tracked: bool,
    pub link: bool,
    pub historical: bool,
}

pub struct ISidesInput<'a> {
    pub store_before_restore: Option<&'a [u8]>,
    pub recorded: Option<&'a [u8]>,
    pub previous: Option<&'a [u8]>,
    pub server: TServer<'a>,
    pub copies: Vec<ICopy<'a>>,
    pub pending_removal: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TLocalContent<'a> {
    Content(Option<&'a [u8]>),
    Conflict(Vec<Option<&'a [u8]>>),
}

pub struct IFileSides<'a> {
    pub local: TLocalContent<'a>,
    pub mine: Option<&'a [u8]>,
    pub theirs: TServer<'a>,
}

pub fn derive_file_sides<'a>(input: &ISidesInput<'a>) -> IFileSides<'a> {
    let server = match input.server {
        TServer::Live(bytes) => Some(bytes),
        _ => None,
    };
    let store = input
        .store_before_restore
        .or(if !input.pending_removal { server } else { None });
    let edited = input.pending_removal
        || input.store_before_restore.is_some_and(|s| {
            Some(s) != input.recorded.or(input.previous) || Some(s) != input.previous
        });
    let mut edits = Vec::new();
    for copy in &input.copies {
        if copy.bytes == server && (copy.base.is_none() || store == input.previous) {
            continue;
        }
        for bytes in target_edits(
            store,
            copy,
            input.pending_removal || matches!(input.server, TServer::Tombstone),
            edited,
        ) {
            if !edits.contains(&bytes) {
                edits.push(bytes);
            }
        }
    }
    let local = if edits.len() > 1 {
        TLocalContent::Conflict(edits)
    } else {
        TLocalContent::Content(edits.first().copied().unwrap_or(store))
    };
    let owner = if input.pending_removal {
        None
    } else {
        match &local {
            TLocalContent::Content(bytes) => *bytes,
            TLocalContent::Conflict(variants) => {
                if edited {
                    store
                } else {
                    variants.iter().copied().flatten().next()
                }
            }
        }
    };
    let mine = match &local {
        TLocalContent::Conflict(variants) if matches_server(owner, input.server) => variants
            .iter()
            .copied()
            .find(|b| !matches_server(*b, input.server))
            .flatten()
            .or(owner),
        _ => owner,
    };
    IFileSides {
        local,
        mine,
        theirs: input.server,
    }
}

fn matches_server(bytes: Option<&[u8]>, server: TServer<'_>) -> bool {
    match server {
        TServer::Live(server) => bytes == Some(server),
        TServer::Tombstone => bytes.is_none(),
        TServer::Absent => false,
    }
}

fn target_edits<'a>(
    store: Option<&'a [u8]>,
    copy: &ICopy<'a>,
    deleted: bool,
    edited: bool,
) -> Vec<Option<&'a [u8]>> {
    if copy.bytes.is_none() || copy.bytes == store || copy.historical {
        return vec![];
    }
    if !copy.tracked || copy.base.is_none() {
        return if edited {
            vec![store, copy.bytes]
        } else {
            vec![copy.bytes, store]
        };
    }
    if copy.link {
        return if store == copy.base {
            vec![copy.bytes]
        } else {
            vec![store, copy.bytes]
        };
    }
    if copy.bytes == copy.base {
        return if store.is_none() && !deleted {
            vec![store, copy.bytes]
        } else {
            vec![]
        };
    }
    if store == copy.base {
        return vec![copy.bytes];
    }
    if edited {
        vec![store, copy.bytes]
    } else {
        vec![copy.bytes, store]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn absent_store_retains_a_changed_copy() {
        let input = ISidesInput {
            store_before_restore: None,
            recorded: None,
            previous: None,
            server: TServer::Absent,
            pending_removal: false,
            copies: vec![ICopy {
                bytes: Some(b"A=2"),
                base: Some(b"A=1"),
                tracked: true,
                link: false,
                historical: false,
            }],
        };
        let result = derive_file_sides(&input);
        assert_eq!(
            result.local,
            TLocalContent::Conflict(vec![Some(b"A=2".as_slice()), None])
        );
        assert_eq!(result.mine, Some(b"A=2".as_slice()));
    }
    #[test]
    fn a_copy_matching_the_server_is_not_an_edit() {
        let input = ISidesInput {
            store_before_restore: Some(b"A=1"),
            recorded: Some(b"A=1"),
            previous: Some(b"A=1"),
            server: TServer::Live(b"A=2"),
            pending_removal: false,
            copies: vec![ICopy {
                bytes: Some(b"A=2"),
                base: Some(b"A=1"),
                tracked: true,
                link: false,
                historical: false,
            }],
        };
        assert_eq!(
            derive_file_sides(&input).local,
            TLocalContent::Content(Some(b"A=1"))
        );
    }
}
