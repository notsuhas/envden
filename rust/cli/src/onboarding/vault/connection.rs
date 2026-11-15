use crate::{
    adapters::IAdapters,
    client::{IClient, IClientOptions, UreqTransport, create_client},
    identity::IDeviceIdentity,
    version::VERSION,
};
use std::rc::Rc;

pub(crate) fn connection(
    adapters: &IAdapters,
    address: &str,
    pin: [u8; 32],
    vault_id: [u8; 32],
    identity: &IDeviceIdentity,
) -> IClient {
    create_client(IClientOptions {
        address: address.into(),
        pin,
        vault_id,
        record: identity.record.clone(),
        req_sk: identity.keys.req_sk,
        version: VERSION.into(),
        now: adapters.now,
        transport: Rc::new(UreqTransport),
        proof: None,
        unlock: None,
        backoff: Rc::new(|ms| std::thread::sleep(std::time::Duration::from_millis(ms))),
    })
}
