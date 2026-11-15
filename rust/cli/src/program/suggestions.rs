pub(super) fn suggest(word: &str, candidates: Vec<String>) -> String {
    let options = word.starts_with("--");
    let word = if options { &word[2..] } else { word };
    let mut best = 3;
    let mut matches = Vec::new();
    for candidate in candidates {
        let candidate = if options {
            candidate.trim_start_matches("--").to_string()
        } else {
            candidate
        };
        let length = word.chars().count().max(candidate.chars().count());
        if candidate.len() <= 1 {
            continue;
        }
        let distance = distance(word, &candidate);
        if (length as f64 - distance as f64) / length as f64 <= 0.4 {
            continue;
        }
        if distance < best {
            best = distance;
            matches.clear();
        }
        if distance == best {
            matches.push(if options {
                format!("--{candidate}")
            } else {
                candidate
            });
        }
    }
    matches.sort();
    matches.dedup();
    match matches.len() {
        0 => String::new(),
        1 => format!("\n(Did you mean {}?)", matches[0]),
        _ => format!("\n(Did you mean one of {}?)", matches.join(", ")),
    }
}

fn distance(a: &str, b: &str) -> usize {
    let a: Vec<_> = a.chars().collect();
    let b: Vec<_> = b.chars().collect();
    let mut d = vec![vec![0; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in d[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
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
