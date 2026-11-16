use super::{ICommand, builder::build};

pub fn format_help(command: &ICommand, width: usize) -> String {
    build(command).term_width(width).render_help().to_string()
}
