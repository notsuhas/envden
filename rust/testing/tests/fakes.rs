#[path = "fakes/keychain.rs"]
mod keychain;
#[path = "fakes/network.rs"]
mod network;
#[path = "fakes/placement.rs"]
mod placement;
#[path = "fakes/repo.rs"]
mod repo;
#[path = "fakes/shell.rs"]
mod shell;
#[path = "fakes/storage.rs"]
mod storage;
#[path = "fakes/storage_queries.rs"]
mod storage_queries;
#[path = "fakes/storage_state.rs"]
mod storage_state;

fn unexpected(result: Result<(), Box<dyn std::any::Any + Send>>, operation: &str) {
    let error = result.unwrap_err();
    let message = error
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| error.downcast_ref::<&str>().copied())
        .unwrap();
    assert_eq!(message, format!("Unexpected fake operation: {operation}"));
}
