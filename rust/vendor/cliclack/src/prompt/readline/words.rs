/// JavaScript's `\s`.
pub fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n'
            | '\x0b'
            | '\x0c'
            | '\r'
            | ' '
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

/// JavaScript's `\w`, which is ASCII only without the `u` flag.
fn js_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn run(chars: impl Iterator<Item = char>, class: impl Fn(char) -> bool) -> usize {
    chars.take_while(|&c| class(c)).count()
}

/// Length of `/^\s*(?:[^\w\s]+|\w+)?/` over the reversed text before the cursor.
pub fn word_left(leading: &[char]) -> usize {
    let spaces = run(leading.iter().rev().copied(), js_space);
    let rest = leading.iter().rev().skip(spaces).copied();

    spaces
        + match leading.len().checked_sub(spaces + 1).map(|i| leading[i]) {
            Some(c) if js_word(c) => run(rest, js_word),
            Some(_) => run(rest, |c| !js_word(c) && !js_space(c)),
            None => 0,
        }
}

/// Length of `/^(?:\s+|[^\w\s]+|\w+)\s*/` over the text after the cursor.
pub fn word_right(trailing: &[char]) -> usize {
    let first = match trailing.first() {
        Some(&c) if js_space(c) => run(trailing.iter().copied(), js_space),
        Some(&c) if js_word(c) => run(trailing.iter().copied(), js_word),
        Some(_) => run(trailing.iter().copied(), |c| !js_word(c) && !js_space(c)),
        None => 0,
    };

    first + run(trailing[first..].iter().copied(), js_space)
}

/// Length of `/^(?:\s+|\W+|\w+)\s*/` over the text after the cursor.
pub fn delete_word_right(trailing: &[char]) -> usize {
    let first = match trailing.first() {
        Some(&c) if js_space(c) => run(trailing.iter().copied(), js_space),
        Some(&c) if js_word(c) => run(trailing.iter().copied(), js_word),
        Some(_) => run(trailing.iter().copied(), |c| !js_word(c)),
        None => 0,
    };

    first + run(trailing[first..].iter().copied(), js_space)
}
