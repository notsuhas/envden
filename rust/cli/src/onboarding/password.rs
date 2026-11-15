use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn confirmed_password(
    mut prompt: impl FnMut(&str) -> Result<String>,
    attempts: usize,
    mut report: impl FnMut(&str),
) -> Result<String> {
    for attempt in 1..=attempts {
        let password = prompt("Master password")?;
        let confirmation = prompt("Confirm master password")?;
        if !password.is_empty() && password == confirmation {
            return Ok(password);
        }
        if attempt < attempts {
            report("The passwords don't match. Enter them again.");
        }
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidInput,
        "Master passwords do not match",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retries_only_mismatches_and_rejects_empty_passwords() {
        let mut answers = ["one", "two", "", "", "correct", "correct"].into_iter();
        let mut reports = vec![];
        assert_eq!(
            confirmed_password(
                |_| Ok(answers.next().unwrap().into()),
                3,
                |message| reports.push(message.to_owned())
            )
            .unwrap(),
            "correct"
        );
        assert_eq!(reports.len(), 2);
        assert_eq!(
            confirmed_password(|_| Ok(String::new()), 1, |_| panic!("no retry"))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
    }
}
