use chrono::{DateTime, Utc};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use lopdf::{Document, Object, Stream, content::Content, dictionary};

pub fn pdf(content: Content, now: u64) -> Result<Vec<u8>> {
    let date = DateTime::<Utc>::from_timestamp_millis(now as i64)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Invalid time value"))?
        .format("D:%Y%m%d%H%M%SZ")
        .to_string();
    let mut document = Document::with_version("1.7");
    let pages = document.new_object_id();
    let mut fonts = lopdf::Dictionary::new();
    for name in ["Helvetica", "Helvetica-Bold", "Courier"] {
        let font = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => name,
            "Encoding" => "WinAnsiEncoding",
        });
        fonts.set(name, font);
    }
    let content = document.add_object(Stream::new(
        dictionary! {},
        content.encode().map_err(failure)?,
    ));
    let page = document.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages, "Contents" => content,
        "Resources" => dictionary! { "Font" => fonts },
        "MediaBox" => vec![0.into(), 0.into(), 595.28.into(), 841.89.into()],
    });
    document.objects.insert(
        pages,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![page.into()], "Count" => 1,
        }),
    );
    let catalog = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages });
    let info = document.add_object(dictionary! {
        "Title" => Object::string_literal("envden Recovery Kit"),
        "Producer" => Object::string_literal("envden"),
        "CreationDate" => Object::string_literal(date.clone()),
        "ModDate" => Object::string_literal(date),
    });
    document.trailer.set("Root", catalog);
    document.trailer.set("Info", info);
    document.compress();
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).map_err(failure)?;

    Ok(bytes)
}

fn failure(error: impl std::error::Error + Send + Sync + 'static) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Could not render recovery kit", error)
}
