use super::*;

#[test]
fn one_deadline_bounds_both_release_requests() {
    let fetch = fake(vec![
        response(503, b""),
        response(200, br#"{"tag_name":"v2.0.0"}"#),
    ]);
    let ticks = std::cell::Cell::new(0);
    let clock = || {
        let tick = ticks.get();
        ticks.set(tick + 400);
        tick
    };
    let mut cache = IUpdateCache::default();
    assert_eq!(
        check_release(&mut cache, 100, &fetch, false, &clock)["kind"],
        "checked"
    );
    assert_eq!(fetch.calls.borrow()[0].2, Duration::from_millis(1600));
    assert_eq!(fetch.calls.borrow()[1].2, Duration::from_millis(800));
    assert_eq!(cache.checked_at, Some(100.0));
}

#[test]
fn expired_deadline_never_stamps_an_unsent_check() {
    let fetch = fake(vec![redirect("v1.2.3")]);
    let ticks = std::cell::Cell::new(0);
    let clock = || {
        let tick = ticks.get();
        ticks.set(2000);
        tick
    };
    let mut cache = IUpdateCache::default();
    assert_eq!(
        check_release(&mut cache, 100, &fetch, false, &clock)["kind"],
        "unavailable"
    );
    assert!(fetch.calls.borrow().is_empty());
    assert_eq!(cache.checked_at, None);
}

#[test]
fn expired_first_request_does_not_send_the_fallback() {
    let fetch = fake(vec![response(503, b"")]);
    let ticks = std::cell::Cell::new(0);
    let clock = || {
        let tick = ticks.get();
        ticks.set(tick + 1000);
        tick
    };
    let mut cache = IUpdateCache::default();
    assert_eq!(
        check_release(&mut cache, 100, &fetch, false, &clock)["kind"],
        "unavailable"
    );
    assert_eq!(fetch.calls.borrow().len(), 1);
    assert_eq!(cache.checked_at, Some(100.0));
}
