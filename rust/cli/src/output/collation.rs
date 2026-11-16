use icu_collator::Collator;
use std::{cmp::Ordering, sync::OnceLock};

pub(crate) fn locale_compare(left: &str, right: &str) -> Ordering {
    static COLLATOR: OnceLock<icu_collator::CollatorBorrowed<'static>> = OnceLock::new();
    COLLATOR
        .get_or_init(|| {
            Collator::try_new(Default::default(), Default::default())
                .expect("compiled collation data")
        })
        .compare(left, right)
}
