pub fn asset(path: &str) -> Option<(&'static str, &'static [u8])> {
    match path {
        "/" => Some((
            "text/html;charset=utf-8",
            include_bytes!("../assets/index.html.bin"),
        )),
        "/chunk-yq6gjs3r.js" => Some((
            "text/javascript;charset=utf-8",
            include_bytes!("../assets/chunk-yq6gjs3r.js.bin"),
        )),
        "/chunk-71vsc44b.css" => Some((
            "text/css;charset=utf-8",
            include_bytes!("../assets/chunk-71vsc44b.css.bin"),
        )),
        _ => None,
    }
}
