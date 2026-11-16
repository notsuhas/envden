use crate::sync::local::reconciliation::resolution::{
    IResolutionInput, IResolutionOptions, TResolution, resolve_content,
};
use envden_core::errors::Result;
use std::cell::RefCell;

const PREVIOUS: &[u8] = b"A=1\nB=1\n";
const MINE: &[u8] = b"A=2\nB=1\n";
const SERVER: &[u8] = b"A=1\nB=2\n";

fn options() -> IResolutionOptions<'static> {
    IResolutionOptions {
        interactive: None,
        yes: false,
        report: None,
        confirm: None,
    }
}

fn input() -> IResolutionInput<'static> {
    IResolutionInput {
        path: ".env",
        mine: Some(MINE),
        server: Some(SERVER),
        previous: Some(PREVIOUS),
        choose: None,
        default_content: Some(SERVER),
    }
}

#[test]
fn explicit_choices_preserve_selected_bytes_and_the_existing_default() {
    for (choice, default, expected) in [
        ("keep-mine", SERVER, MINE),
        ("take-server", SERVER, SERVER),
        ("take-server", MINE, MINE),
    ] {
        let choose = |_: &str| Ok(choice.to_owned());
        let result = resolve_content(
            &options(),
            IResolutionInput {
                choose: Some(&choose),
                default_content: Some(default),
                ..input()
            },
        )
        .unwrap();
        assert!(matches!(result, TResolution::Write(Some(bytes)) if bytes == expected));
    }
}

#[test]
fn merge_confirmation_matches_reference_reports() {
    for accepted in [false, true] {
        let messages = RefCell::new(Vec::new());
        let report = |message: &str| messages.borrow_mut().push(message.to_owned());
        let confirm = |_: &[String]| Ok(accepted);
        let result = resolve_content(
            &IResolutionOptions {
                report: Some(&report),
                confirm: Some(&confirm),
                ..options()
            },
            input(),
        )
        .unwrap();
        assert_eq!(matches!(result, TResolution::Write(_)), accepted);
        assert_eq!(messages.borrow().len(), if accepted { 2 } else { 1 });
    }
}

#[test]
fn missing_baselines_and_noninteractive_choices_remain_conflicts() {
    let result = resolve_content(
        &IResolutionOptions {
            yes: true,
            ..options()
        },
        IResolutionInput {
            previous: None,
            ..input()
        },
    )
    .unwrap();
    assert!(matches!(result, TResolution::Conflict));
    let choose = |_: &str| -> Result<String> { panic!("noninteractive chooser") };
    let confirm = |_: &[String]| -> Result<bool> { panic!("noninteractive confirmation") };
    let result = resolve_content(
        &IResolutionOptions {
            interactive: Some(false),
            confirm: Some(&confirm),
            ..options()
        },
        IResolutionInput {
            choose: Some(&choose),
            ..input()
        },
    )
    .unwrap();
    assert!(matches!(result, TResolution::Conflict));
}
