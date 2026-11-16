use zeroize::Zeroizing;

pub type TText = Zeroizing<Vec<char>>;

pub fn text(value: &[char]) -> TText {
    Zeroizing::new(value.to_vec())
}
