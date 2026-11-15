#[derive(Default)]
pub struct IContent<'a> {
    pub reappeared: bool,
    pub recorded: Option<&'a [u8]>,
    pub detached: bool,
    pub tombstone: bool,
    pub applied: bool,
    pub linked: bool,
    pub use_store: bool,
    pub mine: Option<&'a [u8]>,
    pub server: Option<&'a [u8]>,
    pub previous: Option<&'a [u8]>,
    pub choosing: bool,
    pub repair: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TContentAction<'a> {
    Conflict,
    Detached,
    RepairConflict,
    Choose,
    Write(Option<&'a [u8]>),
}

pub fn derive_content_action<'a>(input: &IContent<'a>) -> TContentAction<'a> {
    let IContent {
        mine,
        server,
        previous,
        ..
    } = *input;
    if (input.recorded.is_some() || input.reappeared)
        && mine != input.recorded
        && mine == previous
        && server != previous
    {
        return TContentAction::Conflict;
    }
    if input.detached {
        return TContentAction::Detached;
    }
    if !input.linked && !input.use_store && mine.is_some() && mine != server && !input.choosing {
        return TContentAction::Conflict;
    }
    if input.repair && mine.is_some() {
        return TContentAction::RepairConflict;
    }
    if input.tombstone && !input.applied && previous.is_none() && mine.is_some() {
        return TContentAction::Choose;
    }
    if input.choosing && mine.is_some() && mine != server {
        return TContentAction::Choose;
    }
    if (input.linked || mine.is_some()) && server != previous && mine != previous && mine != server
    {
        return TContentAction::Choose;
    }
    TContentAction::Write(derive_default_content(input))
}

pub fn derive_default_content<'a>(input: &IContent<'a>) -> Option<&'a [u8]> {
    if (input.linked || (input.use_store && input.mine.is_some())) && input.server == input.previous
    {
        input.mine
    } else {
        input.server
    }
}

pub fn derive_store_source(link: bool, status: &str, linked: bool) -> bool {
    link && status != "detached" && (linked || status == "missing" || status == "linked")
}

pub fn needs_conflict(action: &TContentAction<'_>, choosing: bool, detached_choice: bool) -> bool {
    matches!(
        action,
        TContentAction::Conflict | TContentAction::RepairConflict
    ) || (matches!(action, TContentAction::Detached) && !choosing && !detached_choice)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn absence_does_not_delete_local_edits() {
        let input = IContent {
            linked: true,
            mine: Some(b"A=1"),
            ..Default::default()
        };
        assert_eq!(
            derive_content_action(&input),
            TContentAction::Write(Some(b"A=1"))
        );
        assert_eq!(
            derive_content_action(&IContent {
                tombstone: true,
                ..input
            }),
            TContentAction::Choose
        );
    }
    #[test]
    fn observed_reverts_conflict_before_detachment() {
        let input = IContent {
            linked: true,
            recorded: Some(b"A=2"),
            mine: Some(b"A=1"),
            previous: Some(b"A=1"),
            server: Some(b"A=3"),
            detached: true,
            ..Default::default()
        };
        assert_eq!(derive_content_action(&input), TContentAction::Conflict);
    }
}
