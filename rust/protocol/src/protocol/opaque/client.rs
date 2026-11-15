use super::suite::*;
use crate::protocol::encoding::norm_pw;
use base64::Engine as _;
use envden_core::errors::EnvdenError;
use opaque_ke::rand::rngs::OsRng;
use opaque_ke::{ClientLogin, ClientLoginFinishParameters, CredentialResponse};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct IStartClientLoginParams {
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IStartClientLoginResult {
    #[serde(rename = "clientLoginState")]
    pub client_login_state: String,
    #[serde(rename = "startLoginRequest")]
    pub start_login_request: String,
}

pub fn opaque_start_login(
    params: IStartClientLoginParams,
) -> Result<IStartClientLoginResult, EnvdenError> {
    let mut client_rng = OsRng;
    let client_login_start_result = ClientLogin::<DefaultCipherSuite>::start(
        &mut client_rng,
        norm_pw(&params.password)?.as_bytes(),
    )
    .map_err(from_protocol_error("start client login"))?;

    let result = IStartClientLoginResult {
        client_login_state: BASE64.encode(client_login_start_result.state.serialize()),
        start_login_request: BASE64.encode(client_login_start_result.message.serialize()),
    };
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IFinishClientLoginParams {
    #[serde(rename = "clientLoginState")]
    pub client_login_state: String,
    #[serde(rename = "loginResponse")]
    pub login_response: String,
    pub password: String,

    pub identifiers: Option<ICustomIdentifiers>,

    #[serde(rename = "keyStretching")]
    pub key_stretching_function_config: Option<TKeyStretchingFunctionConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IFinishClientLoginResult {
    #[serde(rename = "finishLoginRequest")]
    pub finish_login_request: String,
    #[serde(rename = "sessionKey")]
    pub session_key: String,
    #[serde(rename = "exportKey")]
    pub export_key: String,
    #[serde(rename = "serverStaticPublicKey")]
    pub server_static_public_key: String,
}

pub fn opaque_finish_login(
    params: IFinishClientLoginParams,
) -> Result<Option<IFinishClientLoginResult>, EnvdenError> {
    let mut client_rng = OsRng;
    let custom_ksf = get_custom_ksf(Some(TKeyStretchingFunctionConfig::Custom {
        iterations: 3,
        memory: 65536,
        parallelism: 4,
    }))?;

    let credential_response_bytes = base64_decode("loginResponse", params.login_response)?;
    let state_bytes = base64_decode("clientLoginState", params.client_login_state)?;
    let state = ClientLogin::<DefaultCipherSuite>::deserialize(&state_bytes)
        .map_err(from_protocol_error("deserialize clientLoginState"))?;

    let finish_params = ClientLoginFinishParameters::new(
        None,
        get_identifiers(&params.identifiers)?,
        custom_ksf.as_ref(),
    );

    let result = state.finish(
        &mut client_rng,
        norm_pw(&params.password)?.as_bytes(),
        CredentialResponse::deserialize(&credential_response_bytes)
            .map_err(from_protocol_error("deserialize loginResponse"))?,
        finish_params,
    );

    if result.is_err() {
        return Ok(None);
    }
    let client_login_finish_result = result.unwrap();

    Ok(Some(IFinishClientLoginResult {
        finish_login_request: BASE64.encode(client_login_finish_result.message.serialize()),
        session_key: BASE64.encode(client_login_finish_result.session_key),
        export_key: BASE64.encode(client_login_finish_result.export_key),
        server_static_public_key: BASE64.encode(client_login_finish_result.server_s_pk.serialize()),
    }))
}
