use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub(super) struct IAttempt {
    pub code: String,
    pub setup: String,
    pub record: String,
}

pub(super) fn prepare(pin: &[u8; 32], mailbox: u32) -> Result<IAttempt> {
    let code = p::generate_pairing_code(mailbox, &p::random_bytes())?;
    let (_, password) = p::normalize_pairing_code(&code)?;
    let setup = p::opaque_create_setup();
    let identifiers = p::pairing_identifiers(pin, mailbox)?;
    let start = p::opaque_start_registration(p::IStartClientRegistrationParams {
        password: password.clone(),
    })?;
    let response = p::opaque_registration_response(p::ICreateServerRegistrationResponseParams {
        server_setup: setup.clone(),
        user_identifier: identifiers.user_identifier,
        registration_request: start.registration_request,
    })?;
    let finish = p::opaque_finish_registration(p::IFinishClientRegistrationParams {
        password,
        registration_response: response.registration_response,
        client_registration_state: start.client_registration_state,
        identifiers: Some(identifiers.identifiers),
        key_stretching_function_config: None,
    })?;
    Ok(IAttempt {
        code,
        setup,
        record: finish.registration_record,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::binary;
    #[test]
    fn local_opaque_exchange_derives_matching_directional_keys() {
        let pin = [7; 32];
        let attempt = prepare(&pin, 3).unwrap();
        let (_, password) = p::normalize_pairing_code(&attempt.code).unwrap();
        let start = p::opaque_start_login(p::IStartClientLoginParams {
            password: password.clone(),
        })
        .unwrap();
        let identifiers = p::pairing_identifiers(&pin, 3).unwrap();
        let response = p::opaque_server_start_login(p::IStartServerLoginParams {
            server_setup: attempt.setup,
            registration_record: Some(attempt.record),
            start_login_request: start.start_login_request,
            user_identifier: identifiers.user_identifier,
            identifiers: Some(p::pairing_identifiers(&pin, 3).unwrap().identifiers),
        })
        .unwrap();
        let finish = p::opaque_finish_login(p::IFinishClientLoginParams {
            password,
            client_login_state: start.client_login_state,
            login_response: response.login_response,
            identifiers: Some(p::pairing_identifiers(&pin, 3).unwrap().identifiers),
            key_stretching_function_config: None,
        })
        .unwrap()
        .unwrap();
        let server = p::opaque_server_finish_login(p::IFinishServerLoginParams {
            server_login_state: response.server_login_state,
            finish_login_request: finish.finish_login_request,
            identifiers: Some(identifiers.identifiers),
        })
        .unwrap();
        assert_eq!(
            p::pairing_channel_keys(&binary(&finish.session_key).unwrap()).unwrap(),
            p::pairing_channel_keys(&binary(&server.session_key).unwrap()).unwrap()
        );
    }
}
