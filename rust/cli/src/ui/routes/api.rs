use super::inputs::parse;
use crate::{
    adapters::IAdapters, client::ITransport, sync::remote::context::ISyncOptions,
    ui::server::app::IApiRequest,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::{Value, json};
use std::{path::PathBuf, rc::Rc};

pub fn options(adapters: &IAdapters) -> ISyncOptions {
    ISyncOptions {
        now: adapters.now,
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    }
}

pub fn api(
    adapters: &IAdapters,
    request: &IApiRequest,
    transport: Rc<dyn ITransport>,
) -> Result<Option<Value>> {
    let mut options = options(adapters);
    let body = &request.body;
    let result = match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/api/status") => {
            super::super::view::status::dashboard_status(adapters, transport)?
        }
        ("GET", "/api/devices") => json!(crate::vault::admin::devices::list(adapters, transport)?),
        ("POST", "/api/push" | "/api/pull") => {
            crate::sync::engine::sync(adapters, options, transport, request.path == "/api/push")?
        }
        ("POST", "/api/devices/rename") => {
            let input = parse(body, &["name"], "Enter a device name")?;
            let changed = crate::vault::admin::devices::rename(
                adapters,
                input["name"].as_str().unwrap(),
                transport,
            )?;
            json!({"kind":if changed {"renamed"}else{"unchanged"}})
        }
        ("POST", "/api/resolve") => {
            let input = parse(body, &["id", "choice"], "Choose a conflict and a side")?;
            crate::sync::resolve::resolve_conflict(
                adapters,
                input["id"].as_str(),
                None,
                input["choice"].as_str().unwrap(),
                &adapters.user_home,
            )?
        }
        ("GET", "/api/history") => {
            let mut query = serde_json::Map::new();
            for (key, value) in url::form_urlencoded::parse(request.query.as_bytes()) {
                if !key.is_empty() {
                    query
                        .entry(key.into_owned())
                        .or_insert_with(|| value.into_owned().into());
                }
            }
            let input = Value::Object(query);
            let input = parse(&input, &["root", "path"], "Choose an env file")?;
            options.cwd = Some(PathBuf::from(input["root"].as_str().unwrap()));
            options.all = false;
            let history = crate::history::list::run::file_history(
                adapters,
                options,
                transport,
                input["path"].as_str(),
            )?;
            let mut file = history["files"]
                .as_array()
                .and_then(|a| a.first())
                .cloned()
                .ok_or_else(|| {
                    EnvdenError::new(ErrorCode::NotFound, "File is not in an approved checkout")
                })?;
            file["checkedAt"] = (adapters.now)().into();
            file
        }
        ("POST", "/api/history/restore") => {
            let input = parse(body, &["root", "path", "version"], "Choose a version")?;
            options.cwd = Some(PathBuf::from(input["root"].as_str().unwrap()));
            options.all = false;
            options.interactive = true;
            options.confirm = Some(Rc::new(|_| Ok(true)));
            crate::history::restore::run::restore(
                adapters,
                options,
                transport,
                input["path"].as_str().unwrap(),
                input["version"].as_f64().unwrap() as u64,
            )?
        }
        _ => return Ok(None),
    };
    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Never;
    impl ITransport for Never {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            panic!("unexpected network")
        }
    }
    #[test]
    fn unconfigured_status_unknown_routes_and_invalid_bodies() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().join("home")),
            dir.path().into(),
            || 1,
        );
        let request = |method: &str, path: &str, body: Value| IApiRequest {
            method: method.into(),
            path: path.into(),
            query: String::new(),
            body,
        };
        assert_eq!(
            api(
                &adapters,
                &request("GET", "/api/status", Value::Null),
                Rc::new(Never)
            )
            .unwrap(),
            Some(json!({"kind":"not-configured"}))
        );
        for (method, path) in [
            ("POST", "/api/status"),
            ("GET", "/api/push"),
            ("GET", "/api/missing"),
        ] {
            assert!(
                api(
                    &adapters,
                    &request(method, path, Value::Null),
                    Rc::new(Never)
                )
                .unwrap()
                .is_none()
            );
        }
        for (path, message) in [
            ("/api/devices/rename", "Enter a device name"),
            ("/api/resolve", "Choose a conflict and a side"),
            ("/api/history/restore", "Choose a version"),
        ] {
            assert_eq!(
                api(
                    &adapters,
                    &request("POST", path, Value::Null),
                    Rc::new(Never)
                )
                .unwrap_err()
                .message,
                message
            );
        }
    }
}
