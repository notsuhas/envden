use super::suite::*;
use base64::Engine as _;
use envden_core::errors::EnvdenError;

use opaque_ke::rand::rngs::OsRng;
use opaque_ke::{
    CredentialFinalization, CredentialRequest, RegistrationRequest, ServerLogin,
    ServerLoginParameters, ServerRegistration, ServerSetup,
};
use serde::{Deserialize, Serialize};

pub fn opaque_create_setup() -> String {
    let mut rng: OsRng = OsRng;
    let setup = ServerSetup::<DefaultCipherSuite>::new(&mut rng);
    BASE64.encode(setup.serialize())
}

fn decode_server_setup(data: String) -> JsResult<ServerSetup<DefaultCipherSuite>> {
    base64_decode("serverSetup", data).and_then(|bytes| {
        ServerSetup::<DefaultCipherSuite>::deserialize(&bytes)
            .map_err(from_protocol_error("deserialize serverSetup"))
    })
}

pub fn get_server_public_key(data: String) -> Result<String, EnvdenError> {
    let server_setup = decode_server_setup(data)?;
    let pub_key = server_setup.keypair().public().serialize();
    Ok(BASE64.encode(pub_key))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ICreateServerRegistrationResponseParams {
    #[serde(rename = "serverSetup")]
    pub server_setup: String,
    #[serde(rename = "userIdentifier")]
    pub user_identifier: String,
    #[serde(rename = "registrationRequest")]
    pub registration_request: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ICreateServerRegistrationResponseResult {
    #[serde(rename = "registrationResponse")]
    pub registration_response: String,
}

pub fn opaque_registration_response(
    params: ICreateServerRegistrationResponseParams,
) -> Result<ICreateServerRegistrationResponseResult, EnvdenError> {
    crate::protocol::encoding::require_value(
        !params.user_identifier.is_empty(),
        "Missing OPAQUE user identifier",
    )?;
    let server_setup = decode_server_setup(params.server_setup)?;
    let registration_request_bytes =
        base64_decode("registrationRequest", params.registration_request)?;
    let server_registration_start_result = ServerRegistration::<DefaultCipherSuite>::start(
        &server_setup,
        RegistrationRequest::deserialize(&registration_request_bytes)
            .map_err(from_protocol_error("deserialize registrationRequest"))?,
        params.user_identifier.as_bytes(),
    )
    .map_err(from_protocol_error("start server registration"))?;
    let registration_response_bytes = server_registration_start_result.message.serialize();

    Ok(ICreateServerRegistrationResponseResult {
        registration_response: BASE64.encode(registration_response_bytes),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IStartServerLoginParams {
    #[serde(rename = "serverSetup")]
    pub server_setup: String,
    #[serde(rename = "registrationRecord")]
    pub registration_record: Option<String>,
    #[serde(rename = "startLoginRequest")]
    pub start_login_request: String,
    #[serde(rename = "userIdentifier")]
    pub user_identifier: String,

    pub identifiers: Option<ICustomIdentifiers>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IStartServerLoginResult {
    #[serde(rename = "serverLoginState")]
    pub server_login_state: String,
    #[serde(rename = "loginResponse")]
    pub login_response: String,
}

pub fn opaque_server_start_login(
    params: IStartServerLoginParams,
) -> Result<IStartServerLoginResult, EnvdenError> {
    crate::protocol::encoding::require_value(
        !params.user_identifier.is_empty(),
        "Missing OPAQUE user identifier",
    )?;
    let server_setup = decode_server_setup(params.server_setup)?;
    let registration_record_bytes = match params.registration_record {
        Some(pw) => base64_decode("registrationRecord", pw).map(Some),
        None => Ok(None),
    }?;
    let credential_request_bytes = base64_decode("startLoginRequest", params.start_login_request)?;

    let mut rng: OsRng = OsRng;

    let registration_record = match registration_record_bytes.as_ref() {
        Some(bytes) => Some(
            ServerRegistration::<DefaultCipherSuite>::deserialize(bytes)
                .map_err(from_protocol_error("deserialize registrationRecord"))?,
        ),
        None => None,
    };

    let start_params = ServerLoginParameters {
        identifiers: get_identifiers(&params.identifiers)?,
        context: None,
    };

    let server_login_start_result = ServerLogin::start(
        &mut rng,
        &server_setup,
        registration_record,
        CredentialRequest::deserialize(&credential_request_bytes)
            .map_err(from_protocol_error("deserialize startLoginRequest"))?,
        params.user_identifier.as_bytes(),
        start_params,
    )
    .map_err(from_protocol_error("start server login"))?;

    let login_response = BASE64.encode(server_login_start_result.message.serialize());
    let server_login_state = BASE64.encode(server_login_start_result.state.serialize());

    let result = IStartServerLoginResult {
        server_login_state,
        login_response,
    };
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IFinishServerLoginParams {
    #[serde(rename = "serverLoginState")]
    pub server_login_state: String,
    #[serde(rename = "finishLoginRequest")]
    pub finish_login_request: String,

    pub identifiers: Option<ICustomIdentifiers>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IFinishServerLoginResult {
    #[serde(rename = "sessionKey")]
    pub session_key: String,
}

pub fn opaque_server_finish_login(
    params: IFinishServerLoginParams,
) -> Result<IFinishServerLoginResult, EnvdenError> {
    let credential_finalization_bytes =
        base64_decode("finishLoginRequest", params.finish_login_request)?;
    let state_bytes = base64_decode("serverLoginState", params.server_login_state)?;
    let state = ServerLogin::<DefaultCipherSuite>::deserialize(&state_bytes)
        .map_err(from_protocol_error("deserialize serverLoginState"))?;

    let finish_params = ServerLoginParameters {
        identifiers: get_identifiers(&params.identifiers)?,
        context: None,
    };

    let server_login_finish_result = state
        .finish(
            CredentialFinalization::deserialize(&credential_finalization_bytes)
                .map_err(from_protocol_error("deserialize finishLoginRequest"))?,
            finish_params,
        )
        .map_err(from_protocol_error("finish server login"))?;
    Ok(IFinishServerLoginResult {
        session_key: BASE64.encode(server_login_finish_result.session_key),
    })
}
