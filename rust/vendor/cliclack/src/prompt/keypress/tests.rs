use super::key::{Keypress, Name};
use super::parse::parse;

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
