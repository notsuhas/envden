use envden_cli::{
    adapters::{IAdapters, create_adapters},
    output::counts::{ICounts, command_counts, set_command_counts},
    program::{
        ICommandActions, ICommandHooks, IInvocation, TParseResult, command_tree, dispatch, parse,
    },
};
use envden_core::errors::Result;

struct Actions;

impl ICommandActions for Actions {
    fn run(&self, _: &IInvocation<'_>, _: &IAdapters) -> Result<()> {
        assert_eq!(command_counts().changed, None);
        set_command_counts(ICounts {
            changed: Some(2),
            conflicts: None,
        });
        Ok(())
    }
}

struct Hooks;

impl ICommandHooks for Hooks {
    fn report(&self, _: &IInvocation<'_>, _: &IAdapters, _: &Result<()>) {
        assert_eq!(command_counts().changed, Some(2));
    }
}

#[test]
fn dispatch_scopes_counts_around_actions_and_reporting() {
    let temp = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(temp.path().join("home")), temp.path().into(), || 42);
    let TParseResult::Action(invocation) = parse(command_tree(), &["version".into()]) else {
        panic!("action expected")
    };
    set_command_counts(ICounts {
        changed: Some(99),
        conflicts: None,
    });
    dispatch(&invocation, &adapters, &Actions, &Hooks).unwrap();
    assert_eq!(command_counts().changed, Some(99));
    set_command_counts(ICounts::default());
}
