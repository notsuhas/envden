use regex::Regex;

pub fn mask_arguments(args: &[String]) -> Vec<String> {
    let secret_flags = ["--setup-token", "--repair-token", "--recovery-kit"];
    let password = Regex::new(r"(?i)^--?[\w-]*pass").unwrap();
    let mut masked = Vec::new();
    for (index, arg) in args.iter().enumerate() {
        let (flag, value) = arg
            .split_once('=')
            .map_or((arg.as_str(), None), |(f, v)| (f, Some(v)));
        if password.is_match(flag) {
            masked.push(if value.is_some() {
                format!("{flag}=[redacted]")
            } else {
                arg.clone()
            });
            masked.extend(args[index + 1..].iter().map(|_| "[redacted]".into()));
            return masked;
        }
        masked.push(if secret_flags.contains(&flag) && value.is_some() {
            format!("{flag}=[redacted]")
        } else if index > 0 && secret_flags.contains(&args[index - 1].as_str()) {
            "[redacted]".into()
        } else {
            arg.clone()
        });
    }
    masked
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn secret_and_password_flags() {
        for (input, expected) in [
            (vec!["push", "--yes"], vec!["push", "--yes"]),
            (
                vec!["join", "h", "--setup-token", "T"],
                vec!["join", "h", "--setup-token", "[redacted]"],
            ),
            (
                vec!["--repair-token=T", "--json"],
                vec!["--repair-token=[redacted]", "--json"],
            ),
            (
                vec!["vault", "--recovery-kit", "/k", "--kit-out", "/o"],
                vec!["vault", "--recovery-kit", "[redacted]", "--kit-out", "/o"],
            ),
            (
                vec!["unlock", "--password", "p", "x"],
                vec!["unlock", "--password", "[redacted]", "[redacted]"],
            ),
            (
                vec!["--master-passphrase=p", "y"],
                vec!["--master-passphrase=[redacted]", "[redacted]"],
            ),
        ] {
            assert_eq!(
                mask_arguments(&input.into_iter().map(str::to_string).collect::<Vec<_>>()),
                expected
            );
        }
    }
}
