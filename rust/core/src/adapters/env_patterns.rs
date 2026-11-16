// fast-glob and Bun.Glob decide these patterns differently, so envden refuses them.
pub fn unsupported_env_pattern(pattern: &str) -> bool {
    let chars: Vec<char> = pattern.chars().collect();
    let path_mode = pattern.contains('/');
    let mut depth = 0usize;
    let mut groups = 0usize;
    let mut index = 0;

    while let Some(&current) = chars.get(index) {
        match current {
            '\\' if index + 1 == chars.len() => return true,
            '\\' => index += 1,
            '[' => match class(&chars, index) {
                Some(class) if !class.unsupported(path_mode) => index = class.end,
                _ => return true,
            },
            '{' => {
                depth += 1;
                groups += 1;
            }
            '}' => depth = depth.saturating_sub(1),
            '.' if depth > 0 && chars.get(index + 1) == Some(&'.') => return true,
            '(' if index > 0 && matches!(chars[index - 1], '+' | '@' | '*' | '?' | '!') => {
                return true;
            }
            _ => {}
        }
        index += 1;
    }

    depth > 0 || groups > 10
}

// fast-glob matches `?` and classes per byte; Bun matches per character.
pub fn byte_sensitive_env_pattern(pattern: &str) -> bool {
    pattern.contains('?') || pattern.contains('[')
}

struct IClass<'a> {
    end: usize,
    negated: bool,
    members: &'a [char],
}

impl IClass<'_> {
    fn unsupported(&self, path_mode: bool) -> bool {
        let spans_separator = self
            .members
            .windows(3)
            .any(|range| range[1] == '-' && range[0] <= '/' && '/' <= range[2]);

        (self.negated && path_mode)
            || spans_separator
            || self.members.iter().any(|c| *c == '/' || !c.is_ascii())
    }
}

fn class(chars: &[char], open: usize) -> Option<IClass<'_>> {
    let mut index = open + 1;
    let negated = matches!(chars.get(index), Some('!' | '^'));

    if negated {
        index += 1;
    }

    let start = index;

    if chars.get(index) == Some(&']') {
        index += 1;
    }

    while *chars.get(index)? != ']' {
        index += if chars[index] == '\\' { 2 } else { 1 };
    }

    Some(IClass {
        end: index,
        negated,
        members: &chars[start..index],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_patterns_are_supported() {
        for pattern in [
            ".env",
            ".env.*",
            ".env*",
            "*.env",
            "**/.env",
            "**/.env.*",
            "apps/*/.env",
            "apps/**/.env.local",
            "!.env.example",
            "!apps/**",
            ".env.{local,development}",
            "{apps,packages}/**/.env",
            ".env.[a-z]*",
            ".env.[!e]*",
            "config/.env.?",
            ".env.\\*",
        ] {
            assert!(!unsupported_env_pattern(pattern), "{pattern}");
        }
    }
}
