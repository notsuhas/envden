pub fn format_bytes(bytes: u64) -> String {
    humansize::format_size(bytes, humansize::BINARY)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_sizes_preserve_units_and_precision() {
        assert_eq!(
            [
                0, 1023, 1152, 1536, 1048575, 5243180, 12_945_818, 1073741824
            ]
            .map(format_bytes),
            [
                "0 B",
                "1023 B",
                "1.12 KiB",
                "1.50 KiB",
                "1024.00 KiB",
                "5.00 MiB",
                "12.35 MiB",
                "1 GiB"
            ]
        );
        assert_eq!(format_bytes(u64::MAX), "16 EiB");
    }
}
