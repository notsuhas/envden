use envden_server::middleware::budget::{BodyBudget, TBudget};

#[test]
fn device_budget_and_release() {
    let budget = BodyBudget::default();
    let identity = Some(("vault1".into(), "vault1:device1".into()));
    let first = budget
        .reserve(67108864, TBudget::Member, identity.clone())
        .unwrap();
    assert!(
        budget
            .reserve(1, TBudget::Member, identity.clone())
            .is_err()
    );
    let second = budget
        .reserve(
            65536,
            TBudget::Member,
            Some(("vault1".into(), "vault1:device2".into())),
        )
        .unwrap();
    drop(second);
    drop(first);
    assert!(budget.reserve(67108864, TBudget::Member, identity).is_ok());
}

#[test]
fn vault_budget_leaves_capacity_for_another_vault() {
    let budget = BodyBudget::default();
    let _first = budget
        .reserve(
            67108864,
            TBudget::Member,
            Some(("v1".into(), "v1:d1".into())),
        )
        .unwrap();
    let _second = budget
        .reserve(
            33554432,
            TBudget::Member,
            Some(("v1".into(), "v1:d2".into())),
        )
        .unwrap();
    assert!(
        budget
            .reserve(1, TBudget::Member, Some(("v1".into(), "v1:d3".into())))
            .is_err()
    );
    assert!(
        budget
            .reserve(
                33554432,
                TBudget::Member,
                Some(("v2".into(), "v2:d1".into()))
            )
            .is_ok()
    );
}

#[test]
fn budgets_are_independent() {
    let identity = Some(("v".into(), "v:d".into()));
    let _first = BodyBudget::default()
        .reserve(67108864, TBudget::Member, identity.clone())
        .unwrap();
    assert!(
        BodyBudget::default()
            .reserve(67108864, TBudget::Member, identity)
            .is_ok()
    );
}

#[test]
fn public_and_authorized_concurrency_limits() {
    let budget = BodyBudget::default();
    let public = (0..8)
        .map(|_| budget.reserve(1, TBudget::Public, None).unwrap())
        .collect::<Vec<_>>();
    assert!(budget.reserve(1, TBudget::Public, None).is_err());
    let authorized = (0..2)
        .map(|_| budget.reserve(1, TBudget::Authorized, None).unwrap())
        .collect::<Vec<_>>();
    assert!(budget.reserve(1, TBudget::Authorized, None).is_err());
    drop(public);
    drop(authorized);
    assert!(budget.reserve(1, TBudget::Public, None).is_ok());
    assert!(budget.reserve(1, TBudget::Authorized, None).is_ok());
}
