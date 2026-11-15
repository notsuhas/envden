use serde_json::{Value, json};

pub fn derive_unlock(recorded: Option<&Value>, probe: &Value, now: f64) -> Value {
    if probe["kind"] == "locked" {
        return json!({"kind":"locked"});
    }
    if probe["kind"] == "unlocked" {
        if probe.get("period") == Some(&Value::Null) {
            return json!({"kind":"never"});
        }
        return if recorded
            .and_then(Value::as_f64)
            .is_some_and(|until| until > now)
        {
            json!({"kind":"until","until":recorded})
        } else {
            json!({"kind":"unrecorded"})
        };
    }
    match recorded {
        Some(Value::Null) => json!({"kind":"never"}),
        None => json!({"kind":"unknown"}),
        Some(value) if value.as_f64().is_some_and(|until| until > now) => {
            json!({"kind":"until","until":value})
        }
        _ => json!({"kind":"locked"}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_status_overrides_recorded_expiry() {
        let future = json!(200);
        assert_eq!(
            derive_unlock(Some(&future), &json!({"kind":"locked"}), 100.0)["kind"],
            "locked"
        );
        for (recorded, probe, expected) in [
            (Some(Value::Null), json!({"kind":"unreachable"}), "never"),
            (None, json!({"kind":"unreachable"}), "unknown"),
            (Some(future), json!({"kind":"unreachable"}), "until"),
            (Some(json!(50)), json!({"kind":"unreachable"}), "locked"),
            (None, json!({"kind":"unlocked","period":null}), "never"),
            (
                Some(json!(50)),
                json!({"kind":"unlocked","period":86400000}),
                "unrecorded",
            ),
        ] {
            assert_eq!(
                derive_unlock(recorded.as_ref(), &probe, 100.0)["kind"],
                expected
            );
        }
    }
}
