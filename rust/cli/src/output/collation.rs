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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_like_en_us_locale_compare() {
        let rows = [
            ("a", "B", Ordering::Less),
            ("a", "A", Ordering::Less),
            ("a10", "a2", Ordering::Less),
            ("é", "f", Ordering::Less),
            ("e\u{301}", "é", Ordering::Equal),
            ("_a", "-a", Ordering::Less),
            ("a/b", "a-b", Ordering::Greater),
            ("ß", "ss", Ordering::Greater),
            ("/repo/b", "/repo/a-z", Ordering::Greater),
        ];

        for (left, right, order) in rows {
            assert_eq!(locale_compare(left, right), order, "{left:?} {right:?}");
        }
    }
}
