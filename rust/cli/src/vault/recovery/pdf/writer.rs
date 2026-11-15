use super::fonts::utf16;
use chrono::{DateTime, Utc};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use flate2::{Compression, write::ZlibEncoder};
use std::io::Write;

pub fn pdf(content: &str, resources: &str, now: u64) -> Result<Vec<u8>> {
    let date = DateTime::<Utc>::from_timestamp_millis(now as i64)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Invalid time value"))?
        .format("D:%Y%m%d%H%M%SZ")
        .to_string();
    let producer = utf16("pdf-lib (https://github.com/Hopding/pdf-lib)");
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(content.as_bytes())
        .map_err(crate::state::files::failure)?;
    let compressed = encoder.finish().map_err(crate::state::files::failure)?;
    let mut objects = vec![
        "<<\n/Type /Pages\n/Kids [ 4 0 R ]\n/Count 1\n>>".as_bytes().to_vec(),
        "<<\n/Type /Catalog\n/Pages 1 0 R\n>>".as_bytes().to_vec(),
        format!("<<\n/Producer <{producer}>\n/ModDate ({date})\n/Creator <{producer}>\n/CreationDate ({date})\n/Title <{}>\n>>", utf16("envden Recovery Kit")).into_bytes(),
        format!("<<\n/Type /Page\n/Parent 1 0 R\n/Resources <<\n/Font <<\n{resources}>>\n/XObject <<\n>>\n/ExtGState <<\n>>\n>>\n/MediaBox [ 0 0 595.28 841.89 ]\n/Annots [ ]\n/Contents [ 8 0 R ]\n>>").into_bytes(),
    ];
    for font in ["Helvetica", "Helvetica-Bold", "Courier"] {
        objects.push(format!("<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /{font}\n/Encoding /WinAnsiEncoding\n>>").into_bytes());
    }
    objects.push(
        [
            format!(
                "<<\n/Filter /FlateDecode\n/Length {}\n>>\nstream\n",
                compressed.len()
            )
            .into_bytes(),
            compressed,
            b"\nendstream".to_vec(),
        ]
        .concat(),
    );
    let mut bytes = b"%PDF-1.7\n%\x81\x81\x81\x81\n\n".to_vec();
    let mut offsets = vec![0];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend(format!("{} 0 obj\n", index + 1).as_bytes());
        bytes.extend(object);
        bytes.extend(b"\nendobj\n\n");
    }
    let xref = bytes.len();
    bytes.extend(b"xref\n0 9\n0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        bytes.extend(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend(
        format!("\ntrailer\n<<\n/Size 9\n/Root 2 0 R\n/Info 3 0 R\n>>\n\nstartxref\n{xref}\n%%EOF")
            .as_bytes(),
    );
    Ok(bytes)
}
