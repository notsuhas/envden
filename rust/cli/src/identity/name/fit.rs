pub fn fit_device_name(name: &str, reserved: usize) -> String {
    let mut end = 0;
    for (index, character) in name.char_indices() {
        let next = index + character.len_utf8();
        if next > 64usize.saturating_sub(reserved) {
            break;
        }
        end = next;
    }
    name[..end].into()
}
