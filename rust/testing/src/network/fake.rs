use envden_core::{adapters::*, errors::Result};
pub type TCheckHttpsCertificate = Box<dyn Fn() -> Result<THttpsCheck> + Send + Sync>;
pub type TStatus = Box<dyn Fn() -> Result<INetworkStatus> + Send + Sync>;
pub type TExpose = Box<dyn Fn(f64) -> Result<String> + Send + Sync>;
pub struct IFakeNetworkAdapter {
    pub id: String,
    pub check_https_certificate: Option<TCheckHttpsCertificate>,
    pub status: Option<TStatus>,
    pub expose: Option<TExpose>,
}
impl Default for IFakeNetworkAdapter {
    fn default() -> Self {
        Self {
            id: "fake-network".into(),
            check_https_certificate: None,
            status: None,
            expose: None,
        }
    }
}
impl INetworkAdapter for IFakeNetworkAdapter {
    fn id(&self) -> &str {
        &self.id
    }
    fn check_https_certificate(&self) -> Result<THttpsCheck> {
        self.check_https_certificate
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: network.checkHttpsCertificate"))(
        )
    }
    fn status(&self) -> Result<INetworkStatus> {
        self.status
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: network.status"))()
    }
    fn expose(&self, port: f64) -> Result<String> {
        self.expose
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: network.expose"))(port)
    }
}
