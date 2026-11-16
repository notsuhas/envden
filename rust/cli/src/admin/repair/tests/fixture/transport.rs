use super::*;
pub(crate) struct Server {
    pub(crate) keys: p::IDeviceKeys,
    pub(crate) entries: Vec<p::ISigned<p::TEntry>>,
    pub(crate) headers: Vec<p::ISigned<p::IManifestHeader>>,
    pub(crate) keyring: Vec<u8>,
    pub(crate) reports: RefCell<Vec<String>>,
    pub(crate) requests: RefCell<Vec<String>>,
    pub(crate) id: [u8; 32],
    pub(crate) recovery: p::IRecoveryKeys,
}

impl ITransport for Server {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let path = request.url.path();
        self.requests.borrow_mut().push(path.into());
        let value = match path {
            "/v1/hello" => {
                let challenge = request
                    .url
                    .query_pairs()
                    .find(|(k, _)| k == "challenge")
                    .unwrap()
                    .1
                    .into_owned();
                let hello = p::build_hello(
                    p::IServerHello {
                        challenge: p::fixed(&binary(&challenge)?)?,
                        host: "server.test".into(),
                        server_sign_pub: self.keys.recovery.obj_pub,
                        app_version: "1.0.0".into(),
                        min_client: "0.0.0".into(),
                        protocols: vec![1],
                    },
                    &self.keys.recovery.obj_sk,
                )?;
                json!({"hello":text(&p::encode(&hello)?)})
            }
            "/v1/entries" | "/v1/headers" => {
                let from = request
                    .url
                    .query_pairs()
                    .find(|(k, _)| k == "from")
                    .unwrap()
                    .1
                    .parse::<u64>()
                    .unwrap();
                let objects = if path == "/v1/entries" {
                    self.entries
                        .iter()
                        .filter(|e| e.body.seq >= from)
                        .map(|v| text(&p::encode(v).unwrap()))
                        .collect::<Vec<_>>()
                } else {
                    self.headers
                        .iter()
                        .filter(|e| e.body.seq >= from)
                        .map(|v| text(&p::encode(v).unwrap()))
                        .collect()
                };
                json!({"objects":objects})
            }
            "/v1/repair/status" => {
                json!({"repairId":text(&self.id),"restoredHead":text(&p::object_hash(&self.headers[0],"manifest")?)})
            }
            "/v1/repair/reports" => json!({"objects":*self.reports.borrow()}),
            "/v1/repair/report" => {
                let _: p::ISigned<p::IRepairReport> = p::decode(&request.body)?;
                self.reports.borrow_mut().push(text(&request.body));
                json!({"kind":"stored"})
            }
            "/v1/unlock-window" => {
                return Ok(IHttpResponse {
                    status: 423,
                    location: None,
                    body: br#"{"error":"RESTORED_MODE"}"#.to_vec(),
                });
            }
            "/v1/envelope" => {
                return Ok(IHttpResponse {
                    status: 404,
                    location: None,
                    body: br#"{"error":"NOT_FOUND"}"#.to_vec(),
                });
            }
            "/v1/head" => {
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: p::encode(self.headers.last().unwrap())?,
                });
            }
            _ if path.starts_with("/v1/repair/material/") => json!({"kind":"stored"}),
            _ if path.starts_with("/v1/keyrings/") => {
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: self.keyring.clone(),
                });
            }
            _ if path.starts_with("/v1/files/") => {
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: p::encode(&p::IFiles { entries: vec![] })?,
                });
            }
            other => panic!("unexpected request {other}"),
        };
        Ok(IHttpResponse {
            status: 200,
            location: None,
            body: value.to_string().into_bytes(),
        })
    }
}
