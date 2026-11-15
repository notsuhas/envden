use super::suite::*;
use crate::protocol::encoding::norm_pw;
use base64::Engine as _;
use envden_core::errors::EnvdenError;
use opaque_ke::rand::rngs::OsRng;
use opaque_ke::{ClientRegistration, ClientRegistrationFinishParameters, RegistrationResponse};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct IStartClientRegistrationParams {
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IStartClientRegistrationResult {
    #[serde(rename = "clientRegistrationState")]
    pub client_registration_state: String,
    #[serde(rename = "registrationRequest")]
    pub registration_request: String,
}

pub fn opaque_start_registration(
    params: IStartClientRegistrationParams,
) -> Result<IStartClientRegistrationResult, EnvdenError> {
    let mut client_rng = OsRng;

    let client_registration_start_result = ClientRegistration::<DefaultCipherSuite>::start(
        &mut client_rng,
        norm_pw(&params.password)?.as_bytes(),
    )
    .map_err(from_protocol_error("start client registration"))?;

    let result = IStartClientRegistrationResult {
        client_registration_state: BASE64
            .encode(client_registration_start_result.state.serialize()),
        registration_request: BASE64.encode(client_registration_start_result.message.serialize()),
    };
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IFinishClientRegistrationParams {
    pub password: String,
    #[serde(rename = "registrationResponse")]
    pub registration_response: String,
    #[serde(rename = "clientRegistrationState")]
    pub client_registration_state: String,

    pub identifiers: Option<ICustomIdentifiers>,

    #[serde(rename = "keyStretching")]
    pub key_stretching_function_config: Option<TKeyStretchingFunctionConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IFinishClientRegistrationResult {
    #[serde(rename = "registrationRecord")]
    pub registration_record: String,
    #[serde(rename = "exportKey")]
    pub export_key: String,
    #[serde(rename = "serverStaticPublicKey")]
    pub server_static_public_key: String,
}

pub fn opaque_finish_registration(
    params: IFinishClientRegistrationParams,
) -> Result<IFinishClientRegistrationResult, EnvdenError> {
    let custom_ksf = get_custom_ksf(Some(TKeyStretchingFunctionConfig::Custom {
        iterations: 3,
        memory: 65536,
        parallelism: 4,
    }))?;

    let registration_response_bytes =
        base64_decode("registrationResponse", params.registration_response)?;
    let mut rng: OsRng = OsRng;
    let client_registration =
        base64_decode("clientRegistrationState", params.client_registration_state)?;
    let state = ClientRegistration::<DefaultCipherSuite>::deserialize(&client_registration)
        .map_err(from_protocol_error("deserialize clientRegistrationState"))?;

    let finish_params = ClientRegistrationFinishParameters::new(
        get_identifiers(&params.identifiers)?,
        custom_ksf.as_ref(),
    );

    let client_finish_registration_result = state
        .finish(
            &mut rng,
            norm_pw(&params.password)?.as_bytes(),
            RegistrationResponse::deserialize(&registration_response_bytes)
                .map_err(from_protocol_error("deserialize registrationResponse"))?,
            finish_params,
        )
        .map_err(from_protocol_error("finish client registration"))?;

    let registration_record_bytes = client_finish_registration_result.message.serialize();
    let result = IFinishClientRegistrationResult {
        registration_record: BASE64.encode(registration_record_bytes),
        export_key: BASE64.encode(client_finish_registration_result.export_key),
        server_static_public_key: BASE64
            .encode(client_finish_registration_result.server_s_pk.serialize()),
    };
    Ok(result)
}
