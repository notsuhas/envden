use super::{Candidate, Fixture};
use envden_core::adapters::storage::{ISessionKey, TSessionKind};
use envden_protocol::protocol::*;
use envden_server::http::encoding::text;
use serde_json::Value;

pub struct VaultFixture {
    pub f: Fixture,
    pub create: ISwap,
    pub recovery: IRecoveryKeys,
    pub sk: IRecoveryKeys,
    pub setup: [u8; 32],
}

pub fn wraps(recipients: &[[u8; 16]]) -> Vec<IWrap> {
    let mut wraps: Vec<_> = recipients
        .iter()
        .map(|id| IWrap {
            recipient: *id,
            enc: random_bytes(),
            ct: vec![1; 48],
        })
        .collect();
    wraps.sort_by_key(|wrap| wrap.recipient);
    wraps
}

impl VaultFixture {
    pub fn new() -> Self {
        let mut f = Fixture::new();
        let recovery = generate_recovery_keys(random_bytes);
        let sk = generate_recovery_keys(random_bytes);
        let genesis = sign_object(
            TEntry {
                vault_id: [0; 32],
                seq: 0,
                parent: [0; 32],
                change: TEntryPayload::Genesis(IGenesis {
                    server_pin: server_pin(&f.options.server_keys.public_key).unwrap(),
                    device: f.member.record.clone(),
                    recovery: IRecoveryRecord {
                        id: recovery_id(&recovery.enc_pub, &recovery.obj_pub),
                        enc_pub: recovery.enc_pub,
                        obj_pub: recovery.obj_pub,
                    },
                    vault_nonce: random_bytes(),
                    created_at: 1,
                }),
                signer: f.member.record.id,
            },
            &f.member.keys.recovery.obj_sk,
            "entry",
        )
        .unwrap();
        let vault = object_hash(&genesis, "entry").unwrap();
        f.vault = vault;
        let epoch = sign_object(
            TEntry {
                vault_id: vault,
                seq: 1,
                parent: vault,
                change: TEntryPayload::NewEpoch(INewEpoch {
                    change: IEpochChange {
                        epoch: 1,
                        key_commit: random_bytes(),
                        wraps: wraps(&[
                            f.member.record.id,
                            recovery_id(&recovery.enc_pub, &recovery.obj_pub),
                        ]),
                    },
                }),
                signer: f.member.record.id,
            },
            &f.member.keys.recovery.obj_sk,
            "entry",
        )
        .unwrap();
        let keyring = vec![1; 64];
        let envelope = vec![2; 64];
        let files = IFiles { entries: vec![] };
        let header = sign_object(
            IManifestHeader {
                vault_id: vault,
                seq: 1,
                op: 0,
                prev: [0; 32],
                list_seq: 1,
                list_head: object_hash(&epoch, "entry").unwrap(),
                epoch: 1,
                keyring_hash: h("keyring-blob", &keyring),
                envelope_hash: h("envelope-blob", &envelope),
                files_hash: h("files", &encode(&files).unwrap()),
                created_at: 1,
                signer: f.member.record.id,
            },
            &f.member.keys.recovery.obj_sk,
            "manifest",
        )
        .unwrap();
        let record = vec![3; 192];
        let create = ISwap {
            expected_head: [0; 32],
            entries: vec![genesis, epoch],
            header,
            files: Some(files),
            keyring: Some(keyring),
            envelope: Some(envelope),
            sk_pub: Some(sk.obj_pub),
            opaque_record: Some(record.clone()),
            approver: None,
        };
        let setup = token_key(TTokenKind::Setup, &random_bytes::<20>());
        f.options.storage.set_setup_token(&setup).unwrap();
        for (purpose, bytes) in [
            ("registration-record", record),
            ("registration-authority", setup.to_vec()),
        ] {
            f.options
                .storage
                .put_session(
                    &vault,
                    &ISessionKey {
                        kind: TSessionKind::Login,
                        device: f.member.record.id.to_vec(),
                        purpose: purpose.into(),
                    },
                    &bytes,
                    f.now(),
                )
                .unwrap();
        }
        Self {
            f,
            create,
            recovery,
            sk,
            setup,
        }
    }
    pub async fn initialize(&self) -> (u16, Value) {
        self.send("/v1/vault", &self.create, &self.f.member, Some("setup"))
            .await
    }
    pub async fn send(
        &self,
        path: &str,
        swap: &ISwap,
        who: &Candidate,
        proof: Option<&str>,
    ) -> (u16, Value) {
        let mut request = self
            .f
            .request(path, "POST", &encode(swap).unwrap(), who, |_| {});
        if let Some(kind) = proof {
            let r: IRequest = decode(
                &envden_server::http::encoding::binary(
                    request.headers()["envden-request"].to_str().unwrap(),
                    None,
                )
                .unwrap(),
            )
            .unwrap();
            let bytes = if kind == "setup" {
                token_proof(TTokenKind::Setup, &self.setup, &r)
                    .unwrap()
                    .to_vec()
            } else {
                sign(&self.sk.obj_sk, "sk-proof", &encode(&r).unwrap()).to_vec()
            };
            request
                .headers_mut()
                .insert("envden-proof", text(&bytes).parse().unwrap());
        }
        self.f.run(request).await
    }
    pub fn next(
        &self,
        previous: &ISigned<IManifestHeader>,
        mut header: IManifestHeader,
        entries: Vec<ISigned<TEntry>>,
        who: &Candidate,
    ) -> ISwap {
        header.seq = previous.body.seq + 1;
        header.prev = object_hash(previous, "manifest").unwrap();
        header.signer = who.record.id;
        ISwap {
            expected_head: header.prev,
            header: sign_object(header, &who.keys.recovery.obj_sk, "manifest").unwrap(),
            entries,
            files: None,
            keyring: None,
            envelope: None,
            sk_pub: None,
            opaque_record: None,
            approver: None,
        }
    }
}
