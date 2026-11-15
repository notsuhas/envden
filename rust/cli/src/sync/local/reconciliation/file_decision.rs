use super::{
    decision::{IContent, TContentAction, derive_content_action},
    sides::{IFileSides, ISidesInput, TLocalContent, TServer, derive_file_sides},
};

pub struct IFileDecisionInput<'a> {
    pub content: IContent<'a>,
    pub sides: ISidesInput<'a>,
    pub tracked: bool,
    pub published: bool,
    pub deleting: bool,
    pub store: Option<&'a [u8]>,
}

pub struct IFileDecision<'a> {
    pub sides: IFileSides<'a>,
    pub action: TContentAction<'a>,
}

pub fn derive_file_decision<'a>(mut input: IFileDecisionInput<'a>) -> IFileDecision<'a> {
    let store = input.store.or(if input.published && !input.deleting {
        input.content.server
    } else {
        None
    });
    input.sides.server = if !input.published {
        TServer::Absent
    } else if input.content.tombstone {
        TServer::Tombstone
    } else {
        TServer::Live(input.content.server.unwrap_or_default())
    };
    input.sides.pending_removal = input.deleting;
    let sides = derive_file_sides(&input.sides);
    input.content.linked = input.tracked || store.is_some();
    input.content.use_store = true;
    input.content.mine = sides.mine;
    if !input.published {
        input.content.server = sides.mine;
    }
    let action = if matches!(sides.local, TLocalContent::Conflict(_)) {
        TContentAction::Conflict
    } else {
        derive_content_action(&input.content)
    };
    IFileDecision { sides, action }
}
