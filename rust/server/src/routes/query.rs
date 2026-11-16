use axum::http::Uri;
use std::collections::HashMap;

pub(super) fn query_parameters(uri: &Uri) -> HashMap<String, String> {
    let mut parameters = HashMap::new();

    for (name, value) in
        url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes()).into_owned()
    {
        parameters.entry(name).or_insert(value);
    }

    parameters
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_mailbox_parameters_select_the_first_value() {
        for (query, expected) in [
            ("mailbox=1234&mailbox=5678", "1234"),
            ("mailbox=&mailbox=5678", ""),
            ("mail%62ox=1234&mailbox=5678", "1234"),
        ] {
            let uri = format!("/v1/swap?{query}").parse().unwrap();

            assert_eq!(query_parameters(&uri).get("mailbox").unwrap(), expected);
        }
    }
}
