use crate::{
    adapters::IAdapters,
    state::{
        NOT_SET_UP,
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub fn derive_alias(aliases: &Value, source: &str, target: &str) -> &'static str {
    if source.is_empty() || target.is_empty() || source == target {
        return "invalid";
    }
    if aliases
        .get(target)
        .map_or_else(|| inherited_alias(target), crate::state::truthy)
        || aliases
            .as_object()
            .is_some_and(|a| a.values().any(|v| v.as_str() == Some(source)))
    {
        return "chain";
    }
    "assign"
}

pub fn alias_repo(adapters: &IAdapters, source: &str, target: &str) -> Result<()> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let mut state = load_state(&adapters.home)?
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, NOT_SET_UP))?;
        match derive_alias(&state["aliases"], source, target) {
            "invalid" => {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Provide different repo IDs",
                ));
            }
            "chain" => {
                return Err(EnvdenError::new(
                    ErrorCode::Conflict,
                    "Alias chains are not allowed",
                ));
            }
            _ => {}
        }
        if source != "__proto__" || state["aliases"].get(source).is_some() {
            state["aliases"][source] = target.into();
        }
        save_state(&adapters.home, &state, (adapters.now)())
    })
}

fn inherited_alias(name: &str) -> bool {
    matches!(
        name,
        "constructor"
            | "__defineGetter__"
            | "__defineSetter__"
            | "hasOwnProperty"
            | "__lookupGetter__"
            | "__lookupSetter__"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toString"
            | "valueOf"
            | "__proto__"
            | "toLocaleString"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn alias_decisions() {
        for (source, target, aliases, expected) in [
            ("", "b", json!({}), "invalid"),
            ("a", "", json!({}), "invalid"),
            ("a", "a", json!({}), "invalid"),
            ("a", "b", json!({"b":"c"}), "chain"),
            ("a", "b", json!({"c":"a"}), "chain"),
            ("a", "b", json!({}), "assign"),
            ("x", "constructor", json!({}), "chain"),
            ("x", "toString", json!({}), "chain"),
            ("x", "hasOwnProperty", json!({}), "chain"),
            ("x", "__proto__", json!({}), "chain"),
            ("x", "constructor", json!({"constructor":""}), "assign"),
            ("x", "constructor", json!({"constructor":null}), "assign"),
            ("x", "b", json!({"b":true}), "chain"),
        ] {
            assert_eq!(derive_alias(&aliases, source, target), expected);
        }
    }
}

#[cfg(test)]
mod persistence_tests {
    use super::*;
    use crate::{adapters::create_adapters, state::empty_state};

    #[test]
    fn own_prototype_property_is_updated() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().to_owned()), dir.path().to_owned(), || 42);
        let mut state = empty_state("test");
        state["aliases"] = serde_json::from_str(r#"{"__proto__":"old"}"#).unwrap();
        save_state(dir.path(), &state, (adapters.now)()).unwrap();
        alias_repo(&adapters, "__proto__", "new").unwrap();
        assert_eq!(
            load_state(dir.path()).unwrap().unwrap()["aliases"]["__proto__"],
            "new"
        );
    }

    #[test]
    fn updates_preserve_aliases_and_rejections_preserve_state() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().to_owned()), dir.path().to_owned(), || {
            1_800_000_000_000
        });
        assert_eq!(
            alias_repo(&adapters, "a", "b").unwrap_err().code,
            ErrorCode::NotFound
        );
        let mut state = empty_state("test");
        state["aliases"] = serde_json::json!({"old":"canonical"});
        save_state(dir.path(), &state, (adapters.now)()).unwrap();
        alias_repo(&adapters, "__proto__", "ignored").unwrap();
        assert_eq!(
            load_state(dir.path()).unwrap().unwrap()["aliases"],
            state["aliases"]
        );
        alias_repo(&adapters, "a", "b").unwrap();
        let saved = load_state(dir.path()).unwrap().unwrap();
        assert_eq!(
            saved["aliases"],
            serde_json::json!({"old":"canonical", "a":"b"})
        );
        for (source, target, code) in [
            ("b", "c", ErrorCode::Conflict),
            ("x", "constructor", ErrorCode::Conflict),
            ("x", "toString", ErrorCode::Conflict),
            ("x", "hasOwnProperty", ErrorCode::Conflict),
            ("a", "a", ErrorCode::InvalidInput),
        ] {
            assert_eq!(
                alias_repo(&adapters, source, target).unwrap_err().code,
                code
            );
            assert_eq!(load_state(dir.path()).unwrap().unwrap(), saved);
        }
    }
}
