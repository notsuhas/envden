use super::*;

pub fn change(
    adapters: &IAdapters,
    old: &str,
    new: &str,
    kit: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        retry_head(|| {
            let context = admin_context(adapters, transport.clone())?;
            login(
                &context.client,
                &context.vault_id,
                TPassword::Fixed(old),
                p::TLoginPurpose::Unlock,
            )?;
            let history = current_history(&context)?;
            let bytes = context.client.request("/v1/envelope", "GET", None)?.body;
            if p::h("envelope-blob", &bytes)
                != history.headers.last().expect("history").body.envelope_hash
            {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Envelope hash mismatch",
                ));
            }
            let secret = Zeroizing::new(p::decode_secret_key(kit)?);
            let mut opened = p::open_envelope(&bytes, old, &secret, &context.vault_id)?;
            let record = register_password(&context.client, &context.vault_id, new)?;
            opened.checkpoint =
                p::object_hash(history.headers.last().expect("history"), "manifest")?;
            opened.sealed_at = (adapters.now)();
            let sealed = p::seal_envelope(
                &opened,
                new,
                &secret,
                &p::random_bytes(),
                &p::random_bytes(),
            )?;
            let mut swap = finish_swap(
                admin_swap(&history, &context.identity, 8, (adapters.now)(), vec![])?,
                &context,
                None,
                Some(sealed),
            )?;
            swap.opaque_record = Some(binary(&record)?);
            commit(&context, &swap)
        })
    })
}
