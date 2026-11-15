use envden_core::{adapters::*, errors::ErrorCode};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TNetworkScenario {
    Ready,
    Problem(TNetworkProblemKind),
    AddressTaken,
    PublishFailed,
}
pub fn network_contract(factory: impl Fn(TNetworkScenario) -> Box<dyn INetworkAdapter>) {
    let adapter = factory(TNetworkScenario::Ready);
    let status = adapter.status().unwrap();
    assert!(status.ready && status.running && status.logged_in && status.https_enabled);
    assert!(status.problem.is_none());
    assert_eq!(
        adapter.check_https_certificate().unwrap(),
        THttpsCheck::Ready
    );
    let hostname = status.hostname.unwrap();
    assert!(!hostname.is_empty());
    assert_eq!(
        adapter.expose(8080.0).unwrap(),
        format!("https://{hostname}:8080")
    );
    for kind in [
        TNetworkProblemKind::NotInstalled,
        TNetworkProblemKind::NotRunning,
        TNetworkProblemKind::LoggedOut,
        TNetworkProblemKind::HttpsDisabled,
        TNetworkProblemKind::Unreadable,
    ] {
        let adapter = factory(TNetworkScenario::Problem(kind));
        let status = adapter.status().unwrap();
        assert!(!status.ready);
        let problem = status.problem.unwrap();
        assert_eq!(problem.kind, kind);
        assert!(!problem.message.is_empty());
        assert_eq!(
            adapter.check_https_certificate().unwrap(),
            THttpsCheck::Problem(problem.clone())
        );
        assert_eq!(adapter.expose(8080.0).unwrap_err().message, problem.message);
    }
    assert_eq!(
        factory(TNetworkScenario::AddressTaken)
            .expose(8080.0)
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(
        factory(TNetworkScenario::PublishFailed)
            .expose(8080.0)
            .is_err()
    );
    assert!(factory(TNetworkScenario::Ready).expose(0.0).is_err());
    for port in [-1.0, 65536.0, 1.5, f64::NAN] {
        assert!(factory(TNetworkScenario::Ready).expose(port).is_err());
    }
}
