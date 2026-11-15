pub fn asset(path: &str) -> Option<(&'static str, &'static [u8])> {
    match path {
        "/" => Some((
            "text/html;charset=utf-8",
            include_bytes!("../assets/index.html.bin"),
        )),
        "/chunk-jtq8kjdg.js" => Some((
            "text/javascript;charset=utf-8",
            include_bytes!("../assets/chunk-jtq8kjdg.js.bin"),
        )),
        "/chunk-9nqj0wqq.css" => Some((
            "text/css;charset=utf-8",
            include_bytes!("../assets/chunk-9nqj0wqq.css.bin"),
        )),
        _ => None,
    }
}
