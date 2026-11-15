use crate::fixtures::with_directory;
use envden_core::adapters::IKeychainAdapter;
pub fn keychain_contract(factory: impl Fn(&str) -> Box<dyn IKeychainAdapter>) {
    with_directory(|root| {
        let adapter = factory(root.to_str().unwrap());
        assert_eq!(adapter.get("missing", false).unwrap(), None);
        adapter.delete("missing").unwrap();
        adapter.delete("missing").unwrap();
        assert_eq!(adapter.get("missing", false).unwrap(), None);
        let mut bytes = vec![0, 255, 128, 10];
        adapter.set("../key", &bytes).unwrap();
        bytes.fill(1);
        adapter.set("other", &[]).unwrap();
        assert_eq!(
            adapter.get("../key", false).unwrap(),
            Some(vec![0, 255, 128, 10])
        );
        assert_eq!(adapter.get("other", false).unwrap(), Some(vec![]));
        assert!(adapter.owner_only().unwrap());
        adapter.set("../key", &[42]).unwrap();
        assert_eq!(adapter.get("../key", false).unwrap(), Some(vec![42]));
        adapter.delete("../key").unwrap();
        assert_eq!(adapter.get("../key", false).unwrap(), None);
        assert_eq!(adapter.get("other", false).unwrap(), Some(vec![]));
    });
}
