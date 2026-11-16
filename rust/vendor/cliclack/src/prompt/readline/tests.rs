use super::super::cursor::StringCursor;
use super::super::keypress::parse;
use super::Readline;

fn edit(initial: &str, input: &str) -> (String, bool) {
    let mut line = StringCursor::default();

    line.extend(initial);

    let mut readline = Readline::new(&mut line);
    let mut chars = input.chars().peekable();

    while chars.peek().is_some() {
        let key = parse(&mut |_| Ok(chars.next())).unwrap();

        readline.apply(&mut line, &key);
    }

    (line.to_string(), readline.closed())
}

#[test]
fn edits_like_readline() {
    let cases = [
        ("device", "\x01\x06\x15X", "Xevice"),
        ("device", "\x01\x04X", "Xevice"),
        ("device", "-my-thing\x17X", "device-my-X"),
        ("device", " a-b\x01\x1bf\x1bfX", "device aX-b"),
        ("device", "\x01\x1b[3;5~X", "X"),
        ("device", "\x15\x19X", "deviceX"),
        ("device", "a\x02\x0b\x01\x0b\x19\x1by", "a"),
        ("device", "ab\x1f\x1fX", "deviceX"),
        ("device", "\x1f\x1f\x1eX", "deviceX"),
        ("device", "x\x0d\x15\x1b[A", "devicex"),
        ("device", "\x1c", "device\x1c"),
    ];

    for (initial, input, expected) in cases {
        assert_eq!(edit(initial, input).0, expected, "{input:?}");
    }
}

#[test]
fn ctrl_d_closes_only_an_empty_line() {
    assert_eq!(edit("", "\x04X"), (String::new(), true));
    assert_eq!(edit("a", "\x04X"), ("aX".into(), false));
}
