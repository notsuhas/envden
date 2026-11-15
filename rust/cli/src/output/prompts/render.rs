use std::io::IsTerminal;

pub(super) fn color(code: &str, text: &str) -> String {
    if std::env::var_os("NO_COLOR").is_some() || !std::io::stdout().is_terminal() {
        return text.into();
    }
    let close = match code {
        "2" => "22",
        "9;2" => "29;22",
        _ => "39",
    };
    format!("\x1b[{code}m{text}\x1b[{close}m")
}

pub(super) fn header(message: &str, state: &str) -> String {
    let (code, symbol) = match state {
        "submit" => ("32", "◇"),
        "cancel" => ("31", "■"),
        "error" => ("33", "▲"),
        _ => ("36", "◆"),
    };
    format!("{}\n{}  {message}\n", color("90", "│"), color(code, symbol))
}

pub fn intro(message: &str) {
    println!("\n{}  {}", color("90", "┌"), message);
}
pub fn outro(message: &str) {
    println!("{}\n{}  {}\n", color("90", "│"), color("90", "└"), message);
}
pub fn log(message: &str) {
    println!("{}\n{}  {}", color("90", "│"), color("36", "●"), message);
}
pub fn note(message: &str, title: &str) {
    let width = message
        .lines()
        .map(|l| l.chars().count())
        .max()
        .unwrap_or(0)
        .max(title.chars().count() + 2);
    println!(
        "{}\n{}  {} {}",
        color("90", "│"),
        color("32", "◇"),
        title,
        color(
            "90",
            &"─".repeat(width.saturating_sub(title.chars().count()))
        )
    );
    for line in message.lines() {
        println!("{}  {line}", color("90", "│"));
    }
    println!("{}", color("90", "│"));
}
