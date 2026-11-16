// envden accepts only the glob grammar where fast-glob and Bun.Glob are known to agree.
pub fn unsupported_env_pattern(pattern: &str) -> bool {
    !supported(pattern)
}

// fast-glob matches `?` per byte; Bun matches per character.
pub fn byte_sensitive_env_pattern(pattern: &str) -> bool {
    pattern.contains('?')
}

const MAX_LENGTH: usize = 1024;
const MAX_GROUPS: usize = 10;
const MAX_ALTERNATIVES: usize = 16;

fn supported(pattern: &str) -> bool {
    let body = pattern.strip_prefix('!').unwrap_or(pattern);
    let mut groups = 0;
    let mut alternatives = 1usize;

    pattern.len() <= MAX_LENGTH
        && body.split('/').all(|segment| {
            segment == "**" || segment_supported(segment, &mut groups, &mut alternatives)
        })
        && groups <= MAX_GROUPS
        && alternatives <= MAX_ALTERNATIVES
}

// A segment of literals, `*` and `?`, with flat brace groups of literals or `*`.
fn segment_supported(segment: &str, groups: &mut usize, alternatives: &mut usize) -> bool {
    let bytes = segment.as_bytes();
    let mut index = 0;

    if bytes.is_empty() {
        return false;
    }

    while let Some(&byte) = bytes.get(index) {
        match byte {
            b'*' if bytes.get(index + 1) == Some(&b'*') => return false,
            b'*' | b'?' => {}
            b'{' => {
                let Some(close) = bytes[index..].iter().position(|b| *b == b'}') else {
                    return false;
                };

                if !group_supported(bytes, index, index + close) {
                    return false;
                }

                *groups += 1;
                *alternatives = alternatives.saturating_mul(
                    bytes[index..index + close]
                        .iter()
                        .filter(|b| **b == b',')
                        .count()
                        + 1,
                );
                index += close;
            }
            byte if literal(byte) => {}
            _ => return false,
        }
        index += 1;
    }

    true
}

// Options are non-empty literals or `*` with no ranges; a starred group never touches an outside `*`.
fn group_supported(bytes: &[u8], open: usize, close: usize) -> bool {
    let options: Vec<&[u8]> = bytes[open + 1..close].split(|b| *b == b',').collect();
    let starred = options.iter().any(|option| option.contains(&b'*'));
    let touches_star = (open > 0 && bytes[open - 1] == b'*') || bytes.get(close + 1) == Some(&b'*');

    !(starred && touches_star)
        && options.iter().all(|option| {
            !option.is_empty()
                && !option.windows(2).any(|pair| pair == b"**" || pair == b"..")
                && option.iter().all(|b| *b == b'*' || literal(*b))
        })
}

fn literal(byte: u8) -> bool {
    (0x20..=0x7e).contains(&byte) && !b"*?[]{}\\,!()|+@/".contains(&byte)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grammar() {
        for (pattern, expected) in [
            (".env", true),
            (".env.*", true),
            (".env*", true),
            (".envrc", true),
            ("*.example", true),
            ("*.local", true),
            ("secrets.*", true),
            ("*", true),
            ("**/.env", true),
            ("apps/*/.env", true),
            ("{apps,packages}/**/.env", true),
            ("!.env.example", true),
            ("!**/.env.example", true),
            ("config/.env.?", true),
            (".env.{local,development,production}", true),
            (".env.{local,*}", true),
            ("!!.env", false),
            (".env.[a-z]*", false),
            (".env\\*", false),
            (".env**", false),
            ("a/**b", false),
            ("{a,{b,c}}", false),
            ("{a,}", false),
            ("*{a,*}", false),
            (".env.{a..c}", false),
            ("+(.env)", false),
            ("a,b", false),
            ("a}b", false),
            ("a//b", false),
            ("/.env", false),
            (".env.é", false),
            (".env.{a,b}{a,b}{a,b}{a,b}{a,b}", false),
        ] {
            assert_eq!(!unsupported_env_pattern(pattern), expected, "{pattern}");
        }
    }
}
