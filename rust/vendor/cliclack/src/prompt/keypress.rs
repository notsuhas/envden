use std::io;

const ESCAPE: char = '\x1b';

/// A key name as Node's readline `emitKeys` reports it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Name {
    /// A letter or digit (lowercased), or the letter of a Ctrl chord.
    Char(char),
    Key(&'static str),
}

/// One decoded keypress, mirroring readline's `(s, key)` pair.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Keypress {
    pub name: Option<Name>,
    pub ctrl: bool,
    pub meta: bool,
    pub shift: bool,
    /// The typed character; readline passes none for escape sequences.
    pub text: Option<char>,
}

impl Keypress {
    pub fn is(&self, name: &str) -> bool {
        matches!(self.name, Some(Name::Key(key)) if key == name) || self.is_char(name)
    }

    fn is_char(&self, name: &str) -> bool {
        let mut chars = name.chars();

        matches!(self.name, Some(Name::Char(c)) if chars.next() == Some(c) && chars.next().is_none())
    }
}

/// Decodes one keypress like readline's `emitKeys`; `next(true)` may time out after an escape.
pub fn parse(next: &mut dyn FnMut(bool) -> io::Result<Option<char>>) -> io::Result<Keypress> {
    let first = next(false)?.ok_or(io::ErrorKind::UnexpectedEof)?;
    let mut sequence = vec![first];
    let mut ch = Some(first);
    let mut escaped = false;

    if first == ESCAPE {
        escaped = true;
        ch = next(true)?;
        sequence.extend(ch);

        if ch == Some(ESCAPE) {
            ch = next(true)?;
            sequence.extend(ch);
        }
    }

    if escaped && matches!(ch, Some('O' | '[')) {
        return control_sequence(ch == Some('O'), &mut sequence, next);
    }

    let mut key = Keypress::default();

    match ch {
        Some('\r') => key.name = Some(Name::Key("return")),
        Some('\n') => key.name = Some(Name::Key("enter")),
        Some('\t') => key.name = Some(Name::Key("tab")),
        Some('\x08' | '\x7f') => key.name = Some(Name::Key("backspace")),
        Some(ESCAPE) => key.name = Some(Name::Key("escape")),
        Some(' ') => key.name = Some(Name::Key("space")),
        Some(c) if !escaped && c <= '\x1a' => {
            key.name = Some(Name::Char(char::from(c as u8 + b'a' - 1)));
            key.ctrl = true;
        }
        Some(c) if c.is_ascii_alphanumeric() => {
            key.name = Some(Name::Char(c.to_ascii_lowercase()));
            key.shift = c.is_ascii_uppercase();
        }
        None => key.name = Some(Name::Key("escape")),
        Some(_) => {}
    }

    if escaped {
        key.meta = true;
    } else {
        key.text = Some(first);
    }

    Ok(key)
}

fn control_sequence(
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

/// Readline's code table: the name plus any shift or ctrl the code itself implies.
fn code_name(code: &str) -> (&'static str, bool, bool) {
    let plain = |name| (name, false, false);

    match code {
        "[P" | "OP" | "[11~" | "[[A" => plain("f1"),
        "[Q" | "OQ" | "[12~" | "[[B" => plain("f2"),
        "[R" | "OR" | "[13~" | "[[C" => plain("f3"),
        "[S" | "OS" | "[14~" | "[[D" => plain("f4"),
        "[[E" | "[15~" => plain("f5"),
        "[17~" => plain("f6"),
        "[18~" => plain("f7"),
        "[19~" => plain("f8"),
        "[20~" => plain("f9"),
        "[21~" => plain("f10"),
        "[23~" => plain("f11"),
        "[24~" => plain("f12"),
        "[200~" => plain("paste-start"),
        "[201~" => plain("paste-end"),
        "[A" | "OA" => plain("up"),
        "[B" | "OB" => plain("down"),
        "[C" | "OC" => plain("right"),
        "[D" | "OD" => plain("left"),
        "[E" | "OE" => plain("clear"),
        "[F" | "OF" | "[4~" | "[8~" => plain("end"),
        "[H" | "OH" | "[1~" | "[7~" => plain("home"),
        "[2~" => plain("insert"),
        "[3~" => plain("delete"),
        "[5~" | "[[5~" => plain("pageup"),
        "[6~" | "[[6~" => plain("pagedown"),
        "[a" => ("up", true, false),
        "[b" => ("down", true, false),
        "[c" => ("right", true, false),
        "[d" => ("left", true, false),
        "[e" => ("clear", true, false),
        "[2$" => ("insert", true, false),
        "[3$" => ("delete", true, false),
        "[5$" => ("pageup", true, false),
        "[6$" => ("pagedown", true, false),
        "[7$" => ("home", true, false),
        "[8$" => ("end", true, false),
        "Oa" => ("up", false, true),
        "Ob" => ("down", false, true),
        "Oc" => ("right", false, true),
        "Od" => ("left", false, true),
        "Oe" => ("clear", false, true),
        "[2^" => ("insert", false, true),
        "[3^" => ("delete", false, true),
        "[5^" => ("pageup", false, true),
        "[6^" => ("pagedown", false, true),
        "[7^" => ("home", false, true),
        "[8^" => ("end", false, true),
        "[Z" => ("tab", true, false),
        _ => plain("undefined"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(input: &str) -> Vec<Keypress> {
        let mut chars = input.chars().peekable();
        let mut keys = Vec::new();

        while chars.peek().is_some() {
            let mut next = |_| Ok(chars.next());
            keys.push(parse(&mut next).unwrap());
        }

        keys
    }

    fn key(name: Name, ctrl: bool, meta: bool, shift: bool, text: Option<char>) -> Keypress {
        Keypress {
            name: Some(name),
            ctrl,
            meta,
            shift,
            text,
        }
    }

    #[test]
    fn decodes_keys_like_readline() {
        let cases = [
            ("a", key(Name::Char('a'), false, false, false, Some('a'))),
            ("B", key(Name::Char('b'), false, false, true, Some('B'))),
            ("\x15", key(Name::Char('u'), true, false, false, Some('\x15'))),
            ("\x00", key(Name::Char('`'), true, false, false, Some('\x00'))),
            ("\r", key(Name::Key("return"), false, false, false, Some('\r'))),
            ("\n", key(Name::Key("enter"), false, false, false, Some('\n'))),
            ("\x08", key(Name::Key("backspace"), false, false, false, Some('\x08'))),
            ("\x1b\x7f", key(Name::Key("backspace"), false, true, false, None)),
            ("\x1bb", key(Name::Char('b'), false, true, false, None)),
            ("\x1b", key(Name::Key("escape"), false, true, false, None)),
            ("\x1b[D", key(Name::Key("left"), false, false, false, None)),
            ("\x1bOH", key(Name::Key("home"), false, false, false, None)),
            ("\x1b[1;5D", key(Name::Key("left"), true, false, false, None)),
            ("\x1b[1;3C", key(Name::Key("right"), false, true, false, None)),
            ("\x1b[1;2D", key(Name::Key("left"), false, false, true, None)),
            ("\x1b[3;5~", key(Name::Key("delete"), true, false, false, None)),
            ("\x1b[3;6~", key(Name::Key("delete"), true, false, true, None)),
            ("\x1b[127;6u", key(Name::Key("undefined"), false, false, false, None)),
            ("\x1b[Z", key(Name::Key("tab"), false, false, true, None)),
        ];

        for (input, expected) in cases {
            assert_eq!(decode(input), vec![expected], "{input:?}");
        }
    }

    #[test]
    fn unnamed_characters_keep_their_text() {
        let keys = decode("-\x1c");

        assert_eq!(keys[0].name, None);
        assert_eq!(keys[0].text, Some('-'));
        assert_eq!(keys[1].text, Some('\x1c'));
    }

    #[test]
    fn sequences_end_where_readline_ends_them() {
        let keys = decode("\x1b[1;5DX");

        assert_eq!(keys.len(), 2);
        assert_eq!(keys[1].text, Some('X'));
    }
}
