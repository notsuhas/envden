use super::ICommand;
use regex::Regex;
use std::sync::LazyLock;

static NEGATIVE_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^-([0-9]+|[0-9]*\.[0-9]+)([eE][+-]?[0-9]+)?$").unwrap());

// Commander reads these as values, not options; no command defines a digit short flag.
pub(super) fn negative_number(token: &str) -> bool {
    NEGATIVE_NUMBER.is_match(token)
}

pub(super) fn known_option(command: &ICommand, token: &str) -> bool {
    let flag = token.split_once('=').map_or(token, |(flag, _)| flag);
    let group = (!token.starts_with("--")).then(|| token.get(..2)).flatten();

    command.options.iter().any(|option| {
        option.long.as_deref() == Some(flag)
            || option.short.as_deref() == Some(flag)
            || (group.is_some() && option.short.as_deref() == group)
    })
}

// Moves leaf operands after one delimiter so clap reads negative numbers as values.
pub(super) fn delimit_operands(normalized: Vec<String>, operands: &[usize]) -> Vec<String> {
    let mut leading = Vec::new();
    let mut values = Vec::new();
    let mut delimited = false;

    for (index, token) in normalized.into_iter().enumerate() {
        if token == "--" && !delimited {
            delimited = true;
        } else if delimited || operands.contains(&index) {
            values.push(token);
        } else {
            leading.push(token);
        }
    }

    leading.push("--".into());
    leading.extend(values);

    leading
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commander_negative_numbers() {
        for (token, expected) in [
            ("-1", true),
            ("-.5", true),
            ("-1e3", true),
            ("-2.5e+3", true),
            ("-1.", false),
            ("-0x1", false),
            ("-١", false),
            ("--1", false),
            ("-", false),
            ("1", false),
        ] {
            assert_eq!(negative_number(token), expected, "{token}");
        }
    }

    #[test]
    fn operands_follow_one_delimiter_in_order() {
        let tokens = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();

        assert_eq!(
            delimit_operands(
                tokens(&["config", "a", "--json", "-1", "--", "--"]),
                &[1, 3]
            ),
            tokens(&["config", "--json", "--", "a", "-1", "--"])
        );
    }
}
