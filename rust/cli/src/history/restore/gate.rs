#[derive(Debug, PartialEq, Eq)]
pub enum TRestoreGate {
    Proceed,
    Confirm,
    Refused(&'static str),
}

pub fn restore_gate(yes: bool, interactive: bool, agent_merge: bool) -> TRestoreGate {
    if interactive {
        return if yes {
            TRestoreGate::Proceed
        } else {
            TRestoreGate::Confirm
        };
    }
    if !agent_merge {
        return TRestoreGate::Refused(
            "Restore requires a terminal; use config agent-merge on before --yes",
        );
    }
    if yes {
        TRestoreGate::Proceed
    } else {
        TRestoreGate::Refused("Non-interactive restore requires --yes")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gate_matrix() {
        for yes in [false, true] {
            for interactive in [false, true] {
                for agent in [false, true] {
                    let result = restore_gate(yes, interactive, agent);
                    assert_eq!(
                        matches!(result, TRestoreGate::Proceed),
                        yes && (interactive || agent)
                    );
                    assert_eq!(matches!(result, TRestoreGate::Confirm), interactive && !yes);
                }
            }
        }
    }
}
