use crate::cases::{assert_parser_cases, read};

#[test]
fn recorded_reference_parser_table() {
    // Captured from the reference commands with actions replaced; binary exits are checked separately.
    assert_parser_cases(read(include_str!("../fixtures/parser.json")));
}

#[test]
fn reviewer_edge_argv_table() {
    assert_parser_cases(read(include_str!("../fixtures/edge-argv.json")));
}
