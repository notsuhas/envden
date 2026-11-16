pub(super) fn parallel_map<T: Sync, R: Send>(
    items: &[T],
    limit: usize,
    work: impl Fn(&T) -> Option<R> + Sync,
) -> Vec<R> {
    items
        .chunks(limit)
        .flat_map(|chunk| {
            std::thread::scope(|scope| {
                let handles: Vec<_> = chunk
                    .iter()
                    .map(|item| scope.spawn(|| work(item)))
                    .collect();
                handles
                    .into_iter()
                    .filter_map(|handle| handle.join().ok().flatten())
                    .collect::<Vec<_>>()
            })
        })
        .collect()
}
