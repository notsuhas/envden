use super::{IHello, ITransport, hello, text};
use crate::version::MIN_SERVER;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    cell::RefCell,
    collections::BTreeMap,
    rc::{Rc, Weak},
};

struct ICache {
    transport: Weak<dyn ITransport>,
    greetings: BTreeMap<String, IHello>,
}

thread_local! {static SERVERS: RefCell<Vec<ICache>> = const { RefCell::new(Vec::new()) };}

pub fn member_hello(
    address: &str,
    pin: &[u8; 32],
    transport: &Rc<dyn ITransport>,
) -> Result<IHello> {
    let url = url::Url::parse(address).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidInput, "Invalid server address", cause)
    })?;
    let key = format!("{}/{}", url.origin().ascii_serialization(), text(pin));
    let cached = SERVERS.with(|servers| {
        let mut servers = servers.borrow_mut();
        servers.retain(|s| s.transport.strong_count() > 0);
        servers
            .iter()
            .find(|s| s.transport.ptr_eq(&Rc::downgrade(transport)))
            .and_then(|s| s.greetings.get(&key).cloned())
    });
    if let Some(cached) = cached {
        return Ok(cached);
    }
    let value = hello(address, Some(pin), &**transport, MIN_SERVER)?;
    SERVERS.with(|servers| {
        let mut servers = servers.borrow_mut();
        if let Some(cache) = servers
            .iter_mut()
            .find(|s| s.transport.ptr_eq(&Rc::downgrade(transport)))
        {
            cache.greetings.insert(key, value.clone());
        } else {
            servers.push(ICache {
                transport: Rc::downgrade(transport),
                greetings: BTreeMap::from([(key, value.clone())]),
            });
        }
    });
    Ok(value)
}
