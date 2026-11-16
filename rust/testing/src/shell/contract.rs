use crate::fixtures::with_directory;
use envden_core::adapters::IShellAdapter;
use std::{fs, path::Path};
pub fn shell_contract(factory: impl Fn(&str) -> Box<dyn IShellAdapter>) {
    with_directory(|home| {
        let adapter = factory(home.to_str().unwrap());
        let rc = adapter.rc_path().unwrap();
        assert!(Path::new(&rc).starts_with(home));
        assert!(!adapter.installed().unwrap());
        fs::create_dir_all(Path::new(&rc).parent().unwrap()).unwrap();
        let original = "# user configuration\n";
        fs::write(&rc, original).unwrap();
        let binary = home.join("bin/envden");
        let binary = binary.to_str().unwrap();
        adapter.install(binary).unwrap();
        let installed = fs::read_to_string(&rc).unwrap();
        assert!(installed.contains(&adapter.hook_snippet(binary).unwrap()));
        assert!(adapter.installed().unwrap());
        adapter.install(binary).unwrap();
        assert_eq!(fs::read_to_string(&rc).unwrap(), installed);
        adapter.uninstall().unwrap();
        adapter.uninstall().unwrap();
        assert!(!adapter.installed().unwrap());
        assert_eq!(fs::read_to_string(&rc).unwrap(), original);
    });
    with_directory(|home| {
        let adapter = factory(home.to_str().unwrap());
        adapter.uninstall().unwrap();
        adapter
            .install(home.join("envden").to_str().unwrap())
            .unwrap();
        assert!(adapter.installed().unwrap());
        adapter.uninstall().unwrap();
        assert!(!adapter.installed().unwrap());
    });
}
