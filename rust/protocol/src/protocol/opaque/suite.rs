use argon2::{Algorithm, Argon2, ParamsBuilder, Version};
use base64::{Engine as _, engine::general_purpose as b64};
use envden_core::errors::{EnvdenError, ErrorCode};
use generic_array::{ArrayLength, GenericArray};
use opaque_ke::{
    Identifiers,
    ciphersuite::CipherSuite,
    errors::{InternalError, ProtocolError},
    ksf::Ksf,
};
use serde::{Deserialize, Serialize};

fn from_base64_error(_: &'static str) -> impl Fn(base64::DecodeError) -> EnvdenError {
    |e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid OPAQUE encoding", e)
}

pub fn from_protocol_error(_: &'static str) -> impl Fn(ProtocolError) -> EnvdenError {
    |e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid OPAQUE message", e)
}

pub struct DefaultCipherSuite;

impl CipherSuite for DefaultCipherSuite {
    type OprfCs = opaque_ke::Ristretto255;
    type KeyExchange = opaque_ke::TripleDh<opaque_ke::Ristretto255, sha2::Sha512>;
    type Ksf = CustomKsf;
}

pub const BASE64: b64::GeneralPurpose = b64::URL_SAFE_NO_PAD;

pub type JsResult<T> = Result<T, EnvdenError>;

#[derive(Default)]
pub struct CustomKsf {
    argon: Argon2<'static>,
}

impl Ksf for CustomKsf {
    fn hash<L: ArrayLength<u8>>(
        &self,
        input: GenericArray<u8, L>,
    ) -> Result<GenericArray<u8, L>, InternalError> {
        let mut output = GenericArray::default();
        self.argon
            .hash_password_into(&input, &[0; argon2::RECOMMENDED_SALT_LEN], &mut output)
            .map_err(|_| InternalError::KsfError)?;
        Ok(output)
    }
}

fn build_argon2_ksf(
    t_cost: u32,
    m_cost: u32,
    parallelism: u32,
) -> Result<Option<CustomKsf>, EnvdenError> {
    let mut param_builder = ParamsBuilder::default();
    param_builder.t_cost(t_cost);
    param_builder.m_cost(m_cost);
    param_builder.p_cost(parallelism);

    if let Ok(params) = param_builder.build() {
        let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        return Ok(Some(CustomKsf { argon }));
    }

    Err(EnvdenError::new(
        ErrorCode::InvalidData,
        "Invalid OPAQUE parameters",
    ))
}

pub fn get_custom_ksf(
    ksf_config: Option<TKeyStretchingFunctionConfig>,
) -> Result<Option<CustomKsf>, EnvdenError> {
    let config = ksf_config.unwrap_or(TKeyStretchingFunctionConfig::MemoryConstrained);

    match config {
        TKeyStretchingFunctionConfig::RfcRecommended
        | TKeyStretchingFunctionConfig::RfcDraftRecommended => {
            build_argon2_ksf(1, u32::pow(2, 21) - 1, 4)
        }

        TKeyStretchingFunctionConfig::MemoryConstrained => build_argon2_ksf(3, u32::pow(2, 16), 4),
        TKeyStretchingFunctionConfig::Custom {
            iterations,
            memory,
            parallelism,
        } => build_argon2_ksf(iterations, memory, parallelism),
    }
}

pub fn base64_decode<T: AsRef<[u8]>>(context: &'static str, input: T) -> JsResult<Vec<u8>> {
    let text = std::str::from_utf8(input.as_ref())
        .map_err(|_| EnvdenError::new(ErrorCode::InvalidData, "Invalid OPAQUE encoding"))?;
    super::message::opaque_message(text, super::message::opaque_length(context))?;
    BASE64.decode(input).map_err(from_base64_error(context))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ICustomIdentifiers {
    pub client: Option<String>,

    pub server: Option<String>,
}

pub fn get_identifiers(
    idents: &Option<ICustomIdentifiers>,
) -> Result<Identifiers<'_>, EnvdenError> {
    crate::protocol::encoding::require_value(
        idents.as_ref().is_some_and(|i| {
            i.client.as_ref().is_some_and(|s| !s.is_empty())
                && i.server.as_ref().is_some_and(|s| !s.is_empty())
        }),
        "Missing OPAQUE identifiers",
    )?;
    Ok(Identifiers {
        client: idents
            .as_ref()
            .and_then(|idents| idents.client.as_ref().map(|val| val.as_bytes())),
        server: idents
            .as_ref()
            .and_then(|idents| idents.server.as_ref().map(|val| val.as_bytes())),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub enum TKeyStretchingFunctionConfig {
    #[serde(rename = "rfc-recommended")]
    RfcRecommended,

    #[serde(rename = "rfc-draft-recommended")]
    RfcDraftRecommended,
    #[serde(rename = "memory-constrained")]
    MemoryConstrained,
    #[serde(rename = "argon2id-custom")]
    Custom {
        #[serde(rename = "iterations")]
        iterations: u32,
        #[serde(rename = "memory")]
        memory: u32,
        #[serde(rename = "parallelism")]
        parallelism: u32,
    },
}
