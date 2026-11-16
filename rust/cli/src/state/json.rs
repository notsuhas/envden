use serde::Serialize;
use serde_json::ser::{Formatter, Serializer};
use std::io;

// JSON.stringify writes numbers with Number#toString, so 100.0 is `100` and 1e21 is `1e+21`.
struct JsNumberFormatter;

impl Formatter for JsNumberFormatter {
    fn write_f64<W: ?Sized + io::Write>(&mut self, writer: &mut W, value: f64) -> io::Result<()> {
        writer.write_all(envden_core::text::js_number(value).as_bytes())
    }
}

pub fn stringify<T: Serialize + ?Sized>(value: &T) -> String {
    let mut bytes = Vec::new();

    value
        .serialize(&mut Serializer::with_formatter(
            &mut bytes,
            JsNumberFormatter,
        ))
        .expect("JSON value");

    String::from_utf8(bytes).expect("JSON is UTF-8")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_numbers_like_json_stringify() {
        let numbers = [
            100.0,
            1.5,
            -0.0,
            1e21,
            1e-7,
            123_456_789_012_345_680_000.0,
            f64::NAN,
            0.1 + 0.2,
            -5.0,
            f64::INFINITY,
        ];

        assert_eq!(
            stringify(&numbers),
            "[100,1.5,0,1e+21,1e-7,123456789012345680000,null,0.30000000000000004,-5,null]"
        );
    }
}
