use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Clone, Copy)]
pub enum TBudget {
    Member,
    Authorized,
    Public,
}

#[derive(Default)]
struct State {
    reserved: [usize; 3],
    active: [usize; 3],
    devices: HashMap<String, usize>,
    vaults: HashMap<String, usize>,
}

#[derive(Clone, Default)]
pub struct BodyBudget(Arc<Mutex<State>>);

pub struct Reservation {
    state: Arc<Mutex<State>>,
    kind: usize,
    bytes: usize,
    identity: Option<(String, String)>,
}

impl BodyBudget {
    pub fn reserve(
        &self,
        bytes: usize,
        kind: TBudget,
        identity: Option<(String, String)>,
    ) -> Result<Reservation> {
        let (kind, capacity, concurrency) = match kind {
            TBudget::Member => (0, 134217728, usize::MAX),
            TBudget::Authorized => (1, 134217728, 2),
            TBudget::Public => (2, 1048576, 8),
        };
        let identity = if kind == 0 { identity } else { None };
        let mut state = self.0.lock().expect("budget lock");
        if bytes > 0
            && (state.reserved[kind] + bytes > capacity
                || state.active[kind] >= concurrency
                || identity.as_ref().is_some_and(|(vault, device)| {
                    state.vaults.get(vault).copied().unwrap_or(0) + bytes > 100663296
                        || state.devices.get(device).copied().unwrap_or(0) + bytes > 67108864
                }))
        {
            return Err(EnvdenError::new(ErrorCode::Busy, "Body budget exceeded"));
        }
        if bytes > 0 {
            state.reserved[kind] += bytes;
            state.active[kind] += 1;
            if let Some((vault, device)) = &identity {
                *state.vaults.entry(vault.clone()).or_default() += bytes;
                *state.devices.entry(device.clone()).or_default() += bytes;
            }
        }

        Ok(Reservation {
            state: self.0.clone(),
            kind,
            bytes,
            identity,
        })
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if self.bytes == 0 {
            return;
        }
        let mut state = self.state.lock().expect("budget lock");
        state.reserved[self.kind] -= self.bytes;
        state.active[self.kind] -= 1;
        if let Some((vault, device)) = &self.identity {
            {
                let (map, key) = (&mut state.vaults, vault);
                let remaining = map[key] - self.bytes;
                if remaining == 0 {
                    map.remove(key);
                } else {
                    map.insert(key.clone(), remaining);
                }
            }
            let remaining = state.devices[device] - self.bytes;
            if remaining == 0 {
                state.devices.remove(device);
            } else {
                state.devices.insert(device.clone(), remaining);
            }
        }
    }
}
