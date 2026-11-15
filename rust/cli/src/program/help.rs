use super::ICommand;

pub fn format_help(command: &ICommand, width: usize) -> String {
    let mut groups: Vec<(String, Vec<(String, String)>)> = Vec::new();
    if command.arguments.iter().any(|a| !a.description.is_empty()) {
        groups.push((
            "Arguments:".into(),
            command
                .arguments
                .iter()
                .map(|a| (a.name.clone(), a.description.clone()))
                .collect(),
        ));
    }
    groups.push((
        "Options:".into(),
        command
            .options
            .iter()
            .filter(|o| !o.hidden)
            .map(|o| (o.flags.clone(), o.description.clone()))
            .collect(),
    ));
    for child in command.commands.iter().filter(|c| !c.hidden) {
        if let Some((_, items)) = groups.iter_mut().find(|(name, _)| *name == child.group) {
            items.push((child.term.clone(), child.description.clone()));
        } else {
            groups.push((
                child.group.clone(),
                vec![(child.term.clone(), child.description.clone())],
            ));
        }
    }
    if !command.commands.is_empty() {
        let item = ("help [command]".into(), "display help for command".into());
        if let Some((_, items)) = groups.iter_mut().find(|(name, _)| name == "Commands:") {
            items.push(item);
        } else {
            groups.push(("Commands:".into(), vec![item]));
        }
    }
    let pad = groups
        .iter()
        .flat_map(|(_, items)| items)
        .map(|(term, _)| term.chars().count())
        .max()
        .unwrap_or(0);
    let mut result = format!("Usage: {}\n\n", command.usage);
    if !command.description.is_empty() {
        result.push_str(&wrap(&command.description, width));
        result.push_str("\n\n");
    }
    for (heading, items) in groups {
        if items.is_empty() {
            continue;
        }
        result.push_str(&heading);
        result.push('\n');
        for (term, description) in items {
            if description.is_empty() {
                result.push_str(&format!("  {term}\n"));
                continue;
            }
            let description = wrap(&description, width.saturating_sub(pad + 4));
            result.push_str(&format!(
                "  {term:pad$}  {}\n",
                description.replace('\n', &format!("\n{}", " ".repeat(pad + 4)))
            ));
        }
        result.push('\n');
    }
    result.pop();
    result
}

fn wrap(text: &str, width: usize) -> String {
    if width < 40 || text.contains("\n ") {
        return text.into();
    }
    text.lines()
        .map(|line| {
            let mut result = String::new();
            let mut size = 0;
            for word in line.split_whitespace() {
                let len = word.chars().count();
                if size > 0 && size + 1 + len > width {
                    result.push('\n');
                    size = 0;
                }
                if size > 0 {
                    result.push(' ');
                    size += 1;
                }
                result.push_str(word);
                size += len;
            }
            result
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_help_matches_commander() {
        fn walk(command: &ICommand) {
            assert_eq!(format_help(command, 80), command.help, "{}", command.usage);
            for child in &command.commands {
                walk(child);
            }
        }
        walk(super::super::command_tree());
    }
}
