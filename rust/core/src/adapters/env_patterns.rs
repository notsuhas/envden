// fast-glob and Bun.Glob decide these patterns differently, so envden refuses them.
pub fn unsupported_env_pattern(pattern: &str) -> bool {
    scan(pattern).is_none_or(|scan| scan.alternatives > MAX_ALTERNATIVES)
}

// fast-glob matches `?` and classes per byte; Bun matches per character.
pub fn byte_sensitive_env_pattern(pattern: &str) -> bool {
    scan(pattern).is_none_or(|scan| scan.byte_sensitive)
}

// Bun stops expanding after 10 brace groups; fast-glob's work grows with every alternative.
const MAX_GROUPS: usize = 10;
const MAX_ALTERNATIVES: usize = 256;

struct IScan {
    byte_sensitive: bool,
    alternatives: usize,
}

fn scan(pattern: &str) -> Option<IScan> {
    let chars: Vec<char> = pattern.chars().collect();
    let path_mode = pattern.contains('/');
    let mut groups: Vec<usize> = Vec::new();
    let mut opened = 0;
    let mut alternatives = 1usize;
    let mut byte_sensitive = false;
    let mut index = 0;

    while let Some(&current) = chars.get(index) {
        match current {
            '\\' => {
                chars.get(index + 1)?;
                index += 1;
            }
            '?' => byte_sensitive = true,
            '[' => {
                let class = class(&chars, index)?;

                if class.unsupported(path_mode) {
                    return None;
                }

                byte_sensitive = true;
                index = class.end;
            }
            '*' if chars.get(index + 1) == Some(&'*') && !groups.is_empty() => return None,
            '{' => {
                opened += 1;
                groups.push(1);
            }
            ',' => {
                if let Some(count) = groups.last_mut() {
                    *count += 1;
                }
            }
            '}' => {
                if let Some(count) = groups.pop() {
                    alternatives = alternatives.saturating_mul(count);
                }
            }
            _ => {}
        }
        index += 1;
    }

    (groups.is_empty() && opened <= MAX_GROUPS).then_some(IScan {
        byte_sensitive,
        alternatives,
    })
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
            ".env.\\[team\\]*",
            ".env.\\+(team)",
            ".env.+(team)",
            ".env.{development..local,production}",
        ] {
            assert!(!unsupported_env_pattern(pattern), "{pattern}");
        }
    }

    #[test]
    fn escaped_wildcards_are_not_byte_sensitive() {
        assert!(!byte_sensitive_env_pattern(".env.\\[team\\]*"));
        assert!(!byte_sensitive_env_pattern(".env.\\?*"));
        assert!(byte_sensitive_env_pattern(".env.?"));
        assert!(byte_sensitive_env_pattern(".env.[a-z]"));
    }
}
