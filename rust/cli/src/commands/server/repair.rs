use super::token::read_token;
use crate::{
    adapters::IAdapters,
    admin::repair::{
        finish::{TFinish, finish_repair, repair_text},
        upload::upload_repair,
    },
    client::UreqTransport,
    output::{print, prompts::secret},
    program::IInvocation,
};
use envden_core::errors::Result;
use envden_protocol::protocol::TTokenKind;
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let token = read_token(
        TTokenKind::Repair,
        invocation
            .options
            .get("repairToken")
            .and_then(|v| v.as_str()),
    )?;
    let flag = |key| {
        invocation
            .options
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    };
    if flag("finish") {
        let password = secret("Master password", |_| None)?;
        let without = invocation
            .options
            .get("without")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect::<Vec<_>>();
        let result = finish_repair(
            adapters,
            &token,
            &password,
            &without,
            flag("acceptLost"),
            Rc::new(UreqTransport),
        )?;
        print(&repair_text(&result));
        if matches!(
            result,
            TFinish::Finished {
                replace_kit: true,
                ..
            }
        ) && crate::output::prompts::consent("Replace the recovery kit now?", false)?
        {
            let mut output = crate::commands::vault::output::replacement_output(adapters, None);
            let password = secret("Master password", |_| None)?;
            let finished = crate::vault::admin::credentials::replace(
                adapters,
                &password,
                Rc::new(UreqTransport),
                None,
                &mut |kit| output.show(kit),
            )
            .inspect_err(|_| output.fail())?;
            print(if finished {
                "Finished an interrupted kit replacement; the kit it showed is now active. Run again for another kit."
            } else {
                "Recovery kit replaced; the old kit no longer works"
            });
        }
    } else {
        upload_repair(adapters, &token, Rc::new(UreqTransport))?;
        print(
            "Uploaded this device's data. Once every device has done this, run envden server repair --finish",
        );
    }
    Ok(())
}
