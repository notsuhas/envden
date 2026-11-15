use super::IFakeKeychainAdapter;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
pub fn create_memory_keychain_adapter(operations: &[&str]) -> IFakeKeychainAdapter {
    let values = Arc::new(Mutex::new(BTreeMap::<String, Vec<u8>>::new()));
    let mut adapter = IFakeKeychainAdapter::default();
    if operations.contains(&"owner_only") {
        adapter.owner_only = Some(Box::new(|| Ok(true)));
    }
    if operations.contains(&"get") {
        let values = values.clone();
        adapter.get = Some(Box::new(move |name, _| {
            Ok(values.lock().unwrap().get(name).cloned())
        }));
    }
    if operations.contains(&"set") {
        let values = values.clone();
        adapter.set = Some(Box::new(move |name, value| {
            values.lock().unwrap().insert(name.into(), value.to_vec());
            Ok(())
        }));
    }
    if operations.contains(&"delete") {
        adapter.delete = Some(Box::new(move |name| {
            values.lock().unwrap().remove(name);
            Ok(())
        }));
    }
    adapter
}
