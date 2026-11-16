pub(super) fn suggestions(word: &str, candidates: Vec<&str>) -> String {
    let options = word.starts_with("--");
    let word = word.strip_prefix("--").unwrap_or(word);
    let mut best_distance = 3;
    let mut similar = Vec::new();
    for candidate in candidates {
        let candidate = if options {
            candidate.strip_prefix("--").unwrap_or(candidate)
        } else {
            candidate
        };
        let length = word
            .encode_utf16()
            .count()
            .max(candidate.encode_utf16().count());
        if candidate.encode_utf16().count() <= 1 {
            continue;
        }
        let distance = distance(word, candidate);
        if (length - distance) as f64 / length as f64 <= 0.4 {
            continue;
        }
        if distance < best_distance {
            best_distance = distance;
            similar.clear();
        }
        if distance == best_distance {
            similar.push(candidate);
        }
    }
    similar.sort_unstable();
    similar.dedup();
    let similar: Vec<_> = similar
        .into_iter()
        .map(|name| {
            if options {
                format!("--{name}")
            } else {
                name.to_string()
            }
        })
        .collect();

    match similar.as_slice() {
        [] => String::new(),
        [name] => format!("\n(Did you mean {name}?)"),
        names => format!("\n(Did you mean one of {}?)", names.join(", ")),
    }
}

// Commander uses optimal string alignment over JavaScript UTF-16 code units.
fn distance(a: &str, b: &str) -> usize {
    let a: Vec<_> = a.encode_utf16().collect();
    let b: Vec<_> = b.encode_utf16().collect();
    if a.len().abs_diff(b.len()) > 3 {
        return a.len().max(b.len());
    }
    let mut d: Vec<Vec<usize>> = (0..=a.len())
        .map(|i| (0..=b.len()).map(|j| if i == 0 { j } else { i }).collect())
        .collect();
    for j in 1..=b.len() {
        for i in 1..=a.len() {
            d[i][j] = (d[i - 1][j] + 1)
                .min(d[i][j - 1] + 1)
                .min(d[i - 1][j - 1] + usize::from(a[i - 1] != b[j - 1]));
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }

    d[a.len()][b.len()]
}
