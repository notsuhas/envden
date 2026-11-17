use crate::{
    adapters::IAdapters,
    admin::shared::{
        context::{IAdminContext, admin_context},
        history::current_history,
    },
    client::ITransport,
    time::TSharedClock,
    vault::{admin::material::current_material, history::IVaultHistory},
};
use envden_core::errors::Result;
use std::{collections::BTreeMap, rc::Rc};

pub struct IHistorySource<'a> {
    pub context: IAdminContext<'a>,
    pub history: IVaultHistory,
    pub keys: BTreeMap<u32, [u8; 32]>,
    pub id_key: [u8; 32],
}

pub fn history_source(
    adapters: &IAdapters,
    now: TSharedClock,
    transport: Rc<dyn ITransport>,
) -> Result<IHistorySource<'_>> {
    let mut context = admin_context(adapters, transport)?;
    context.client.options.now = now;
    let history = current_history(&context)?;
    let material = current_material(&context, &history)?;

    Ok(IHistorySource {
        context,
        history,
        keys: material.keys,
        id_key: material.ring.id_key,
    })
}
