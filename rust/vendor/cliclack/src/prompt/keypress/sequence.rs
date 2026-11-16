use std::io;

use super::codes::code_name;
use super::key::{Keypress, Name};

pub fn control_sequence(
    ss3: bool,
    sequence: &mut Vec<char>,
    next: &mut dyn FnMut(bool) -> io::Result<Option<char>>,
) -> io::Result<Keypress> {
    let mut read = |sequence: &mut Vec<char>| -> io::Result<Option<char>> {
        let ch = next(false)?;
        sequence.extend(ch);

        Ok(ch)
    };
    let digit = |ch: Option<char>| ch.is_some_and(|c| c.is_ascii_digit());
    let mut code = String::from(if ss3 { 'O' } else { '[' });
    let mut modifier = 0;

    if ss3 {
        let mut ch = read(sequence)?;

        if digit(ch) {
            modifier = ch.and_then(|c| c.to_digit(10)).unwrap_or(0) as i32 - 1;
            ch = read(sequence)?;
        }

        code.extend(ch);
    } else {
        let mut ch = read(sequence)?;

        if ch == Some('[') {
            code.push('[');
            ch = read(sequence)?;
        }

        let start = sequence.len() - usize::from(ch.is_some());

        if digit(ch) {
            ch = read(sequence)?;

            if digit(ch) {
                ch = read(sequence)?;

                if digit(ch) {
                    ch = read(sequence)?;
                }
            }
        }

        if ch == Some(';') {
            ch = read(sequence)?;

            if digit(ch) {
                read(sequence)?;
            }
        }

        let command: String = sequence[start..].iter().collect();
        let (suffix, parsed) = command_code(&command);

        code.push_str(&suffix);
        modifier = parsed.unwrap_or(modifier);
    }

    let mut key = Keypress {
        ctrl: modifier & 4 != 0,
        meta: modifier & 10 != 0,
        shift: modifier & 1 != 0,
        ..Keypress::default()
    };
    let (name, shift, ctrl) = code_name(&code);

    key.name = Some(Name::Key(name));
    key.shift |= shift;
    key.ctrl |= ctrl;

    Ok(key)
}

/// Splits a CSI body into readline's code suffix and modifier.
fn command_code(command: &str) -> (String, Option<i32>) {
    let bytes = command.as_bytes();
    let all_digits = |part: &[u8]| !part.is_empty() && part.iter().all(u8::is_ascii_digit);
    let modifier = |m: Option<&[u8]>| m.map_or(0, |m| i32::from(m[0] - b'0') - 1);

    if bytes.len() == 4 && all_digits(&bytes[..3]) && bytes[3] == b'~' {
        return (command.to_string(), Some(0));
    }

    if let Some((&last, body)) = bytes.split_last() {
        if matches!(last, b'~' | b'^' | b'$') {
            let (number, extra) = match body.iter().position(|&b| b == b';') {
                Some(i) => (&body[..i], Some(&body[i + 1..])),
                None => (body, None),
            };
            let extra_ok = extra.is_none_or(|e| e.len() == 1 && e[0].is_ascii_digit());

            if (1..=2).contains(&number.len()) && all_digits(number) && extra_ok {
                let mut code = String::from_utf8_lossy(number).into_owned();
                code.push(char::from(last));

                return (code, Some(extra.map_or(0, |e| modifier(Some(e)))));
            }
        }

        if last.is_ascii_alphabetic() {
            let parsed = match body {
                [] => Some(None),
                [d] if d.is_ascii_digit() => Some(Some(&body[0..1])),
                [a, b';', d] if a.is_ascii_digit() && d.is_ascii_digit() => Some(Some(&body[2..3])),
                _ => None,
            };

            if let Some(m) = parsed {
                return (char::from(last).to_string(), Some(modifier(m)));
            }
        }
    }

    (command.to_string(), None)
}
