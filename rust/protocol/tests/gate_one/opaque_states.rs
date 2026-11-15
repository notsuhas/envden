use super::*;

#[test]
fn opaque_stored_states() {
    for (name, pw) in [("opaque.json", "password"), ("pairing.json", "01234567")] {
        let v = vector(name);
        let l = &v["login"];
        let params = |password: &str| IFinishClientLoginParams {
            password: password.into(),
            client_login_state: l["clientLoginState"].as_str().unwrap().into(),
            login_response: l["loginResponse"].as_str().unwrap().into(),
            identifiers: Some(serde_json::from_value(v["ids"]["identifiers"].clone()).unwrap()),
            key_stretching_function_config: None,
        };
        let result = opaque_finish_login(params(pw)).unwrap().unwrap();
        assert_eq!(result.session_key, l["sessionKey"]);
        assert_eq!(result.finish_login_request, l["finishLoginRequest"]);
        assert_eq!(result.export_key, l["exportKey"]);
        assert_eq!(result.server_static_public_key, l["serverStaticPublicKey"]);
        assert!(opaque_finish_login(params("wrong")).unwrap().is_none());
        let r = opaque_server_finish_login(IFinishServerLoginParams {
            server_login_state: l["serverLoginState"].as_str().unwrap().into(),
            finish_login_request: result.finish_login_request,
            identifiers: Some(serde_json::from_value(v["ids"]["identifiers"].clone()).unwrap()),
        })
        .unwrap();
        assert_eq!(r.session_key, result.session_key);
        let reg = &v["registration"];
        let response = opaque_registration_response(ICreateServerRegistrationResponseParams {
            server_setup: reg["serverSetup"].as_str().unwrap().into(),
            user_identifier: v["ids"]["userIdentifier"].as_str().unwrap().into(),
            registration_request: reg["registrationRequest"].as_str().unwrap().into(),
        })
        .unwrap();
        assert_eq!(response.registration_response, reg["registrationResponse"]);
        let result = opaque_finish_registration(IFinishClientRegistrationParams {
            password: pw.into(),
            registration_response: response.registration_response,
            client_registration_state: reg["clientRegistrationState"].as_str().unwrap().into(),
            identifiers: Some(serde_json::from_value(v["ids"]["identifiers"].clone()).unwrap()),
            key_stretching_function_config: None,
        })
        .unwrap();
        assert_eq!(
            result.server_static_public_key,
            reg["serverStaticPublicKey"]
        );
        assert_eq!(
            opaque_message(&result.registration_record, 192).unwrap(),
            result.registration_record
        );
    }
}
