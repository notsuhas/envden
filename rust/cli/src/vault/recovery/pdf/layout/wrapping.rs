use super::super::fonts;

pub(super) fn lines(text: &str, width: f64, size: f64) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in text.split_inclusive(' ') {
        if fonts::width(&format!("{line}{word}"), size) > width && !line.is_empty() {
            lines.push(envden_core::text::js_trim(&line).to_owned());
            line.clear();
        }
        for character in word.chars() {
            if fonts::width(&format!("{line}{character}"), size) > width && !line.is_empty() {
                lines.push(envden_core::text::js_trim(&line).to_owned());
                line.clear();
            }
            line.push(character);
        }
    }
    if !line.is_empty() {
        lines.push(envden_core::text::js_trim(&line).to_owned());
    }

    lines
}
