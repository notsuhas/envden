use super::*;

pub fn reset(
    adapters: &IAdapters,
    password: &str,
    kit: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        retry_head(|| {
            let secret = Zeroizing::new(p::decode_secret_key(kit)?);
            let keys = p::generate_recovery_keys(p::random_bytes);
            let mut context = admin_context(adapters, transport.clone())?;
            let proof_secret = secret.clone();
            context.client.options.proof = Some(Rc::new(move |request| {
                p::sign_sk_proof(&proof_secret, &request.vault_id, request).map(|b| b.to_vec())
            }));
            let history = current_history(&context)?;
            let recovery = recovery(&keys);
            let (change, keyring) = next_epoch(&context, &history, &recovery, None)?;
            let entry = entry(
                &context,
                &history,
                p::TEntryPayload::ReplaceRecovery(p::IReplaceRecovery { recovery, change }),
            )?;
            let record = register_password(&context.client, &context.vault_id, password)?;
            let sealed = envelope(&context, &history, &keys, password, &secret)?;
            let mut swap = finish_swap(
                admin_swap(
                    &history,
                    &context.identity,
                    9,
                    (adapters.now)(),
                    vec![entry],
                )?,
                &context,
                Some(keyring),
                Some(sealed),
            )?;
            swap.opaque_record = Some(binary(&record)?);
            commit(&context, &swap)
        })
    })
}
