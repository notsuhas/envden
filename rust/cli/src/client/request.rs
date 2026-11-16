use super::{IHttpRequest, IHttpResponse, ITransport, hello, response_error, retry_busy, text};
use crate::{time::TSharedClock, version::MIN_SERVER};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, rc::Rc, time::Duration};

pub type TProof = Rc<dyn Fn(&p::IRequest) -> Result<Vec<u8>>>;
pub type TUnlock = Rc<dyn Fn() -> Result<()>>;

#[derive(Clone)]
pub struct IClientOptions {
    pub address: String,
    pub pin: [u8; 32],
    pub vault_id: [u8; 32],
    pub record: p::IDeviceRecord,
    pub req_sk: [u8; 32],
    pub version: String,
    pub now: TSharedClock,
    pub transport: Rc<dyn ITransport>,
    pub proof: Option<TProof>,
    pub unlock: Option<TUnlock>,
    pub backoff: Rc<dyn Fn(u64)>,
}

pub struct IClient {
    pub options: IClientOptions,
}

pub fn create_client(options: IClientOptions) -> IClient {
    IClient { options }
}

impl IClient {
    pub fn for_vault(&self, vault_id: [u8; 32]) -> Self {
        let mut options = self.options.clone();
        options.vault_id = vault_id;
        Self { options }
    }

    pub fn request(
        &self,
        path: &str,
        method: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<IHttpResponse> {
        let bytes = body
            .map(serde_json::to_vec)
            .transpose()
            .map_err(|cause| {
                EnvdenError::with_source(ErrorCode::InvalidInput, "Invalid request body", cause)
            })?
            .unwrap_or_default();
        self.request_bytes(path, method, &bytes)
    }

    pub fn request_bytes(&self, path: &str, method: &str, body: &[u8]) -> Result<IHttpResponse> {
        retry_busy(
            || self.signed_request(path, method, body, true),
            |ms| (self.options.backoff)(ms),
        )
    }

    fn signed_request(
        &self,
        path: &str,
        method: &str,
        body: &[u8],
        retry: bool,
    ) -> Result<IHttpResponse> {
        let options = &self.options;
        let base = url::Url::parse(&options.address).map_err(|cause| {
            EnvdenError::with_source(
                ErrorCode::InvalidInput,
                "Invalid request destination",
                cause,
            )
        })?;
        let url = base.join(path).map_err(|cause| {
            EnvdenError::with_source(
                ErrorCode::InvalidInput,
                "Invalid request destination",
                cause,
            )
        })?;
        if url.origin() != base.origin() {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Invalid request destination",
            ));
        }
        super::member_hello(&options.address, &options.pin, &options.transport)?;
        let value = p::IRequest {
            server_pin: options.pin,
            vault_id: options.vault_id,
            method: method.into(),
            path_and_query: format!(
                "{}{}",
                url.path(),
                url.query().map(|q| format!("?{q}")).unwrap_or_default()
            ),
            body_hash: Sha256::digest(body).into(),
            time: (options.now)(),
            nonce: p::random_bytes(),
            device: options.record.id,
            client_version: options.version.clone(),
        };
        let mut headers = BTreeMap::from([
            ("Content-Type".into(), "application/json".into()),
            ("Envden-Request".into(), text(&p::encode(&value)?)),
            ("Envden-Device".into(), text(&value.device)),
            ("Envden-Body-Hash".into(), text(&value.body_hash)),
            ("Envden-Time".into(), value.time.to_string()),
            ("Envden-Nonce".into(), text(&value.nonce)),
            (
                "Envden-Signature".into(),
                text(&p::sign_request(value.clone(), &options.req_sk)?.signature),
            ),
            (
                "Envden-Device-Record".into(),
                text(&p::encode(&options.record)?),
            ),
        ]);
        if let Some(proof) = &options.proof {
            headers.insert("Envden-Proof".into(), text(&proof(&value)?));
        }
        let response = options.transport.fetch(IHttpRequest {
            url: url.clone(),
            method: method.into(),
            headers,
            body: body.into(),
            allow_redirect_response: false,
            timeout: Duration::from_secs(15),
        })?;
        if response.status == 426 {
            self.check_minimum()?;
        }
        if !response.ok() {
            let error = response_error(&response.json().unwrap_or_default(), url.path());
            if error.code == ErrorCode::Locked
                && retry
                && let Some(unlock) = &options.unlock
            {
                unlock()?;
                return self.signed_request(path, method, body, false);
            }
            return Err(error);
        }
        crate::updates::status::scoped_authenticated_request_succeeded()?;
        Ok(response)
    }

    fn check_minimum(&self) -> Result<()> {
        let options = &self.options;
        let verified = hello(
            &options.address,
            Some(&options.pin),
            &*options.transport,
            MIN_SERVER,
        )?;
        if p::compare_semver(&options.version, &verified.hello.min_client)?.is_lt() {
            if let Ok(latest) = super::minimum::latest_release(&*options.transport)
                && p::compare_semver(&verified.hello.min_client, &latest)?.is_gt()
            {
                return Err(EnvdenError::new(
                    ErrorCode::ClientTooOld,
                    "The server requires a version that doesn't exist",
                ));
            }
            return Err(EnvdenError::new(
                ErrorCode::ClientTooOld,
                "Update envden to meet the signed server minimum",
            ));
        }
        Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Server rejected a supported client",
        ))
    }
}
