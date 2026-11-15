use super::fit_device_name;
use std::collections::HashSet;

pub fn unique_device_name<'a>(name: &str, taken: impl IntoIterator<Item = &'a str>) -> String {
    let names: HashSet<_> = taken.into_iter().collect();
    if !names.contains(name) {
        return name.into();
    }
    for number in 2u64.. {
        let suffix = format!("-{number}");
        let candidate = fit_device_name(name, suffix.len()) + &suffix;
        if !names.contains(candidate.as_str()) {
            return candidate;
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unique_names_match_reference() {
        for (name, taken, expected) in [
            ("laptop".into(), vec!["desktop".into()], "laptop".into()),
            ("laptop".into(), vec!["laptop".into()], "laptop-2".into()),
            (
                "laptop".into(),
                vec!["laptop".into(), "laptop-2".into()],
                "laptop-3".into(),
            ),
            (
                "laptop".into(),
                vec!["laptop".into(), "laptop-3".into()],
                "laptop-2".into(),
            ),
            (
                "a".repeat(64),
                vec!["a".repeat(64)],
                format!("{}-2", "a".repeat(62)),
            ),
            (
                "é".repeat(32),
                vec!["é".repeat(32)],
                format!("{}-2", "é".repeat(31)),
            ),
        ] {
            assert_eq!(
                unique_device_name(&name, taken.iter().map(String::as_str)),
                expected
            );
        }
    }
}
