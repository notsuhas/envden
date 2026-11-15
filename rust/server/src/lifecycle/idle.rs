use tokio::{sync::watch, time::Instant};

pub(super) async fn expired(mut activity: watch::Receiver<Instant>) {
    loop {
        let deadline = *activity.borrow_and_update() + std::time::Duration::from_secs(10);
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => return,
            changed = activity.changed() => if changed.is_err() { return; },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test(start_paused = true)]
    async fn silence_expires_and_activity_restarts_deadline() {
        let (activity, receive) = watch::channel(Instant::now());
        let mut expired = Box::pin(expired(receive));
        assert!(
            tokio::time::timeout(Duration::from_secs(9), &mut expired)
                .await
                .is_err()
        );
        activity.send(Instant::now()).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_secs(9), &mut expired)
                .await
                .is_err()
        );
        assert!(
            tokio::time::timeout(Duration::from_secs(2), &mut expired)
                .await
                .is_ok()
        );
    }
}
