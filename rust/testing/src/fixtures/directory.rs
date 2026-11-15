use std::path::Path;
pub fn with_directory<T>(run: impl FnOnce(&Path) -> T) -> T {
    let directory = tempfile::Builder::new()
        .prefix("envden-test-")
        .tempdir()
        .unwrap();
    run(directory.path())
}
