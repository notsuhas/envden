use super::fonts;
use lopdf::{
    Object, StringFormat,
    content::{Content, Operation},
};

pub(super) struct IPen {
    pub(super) content: Content,
}

impl IPen {
    pub(super) fn write(&mut self, text: &str, x: f64, y: f64, font: &str, size: f64, muted: bool) {
        let color = if muted {
            [0.42, 0.42, 0.46]
        } else {
            [0.1, 0.1, 0.12]
        };
        self.content.operations.extend([
            Operation::new("BT", vec![]),
            Operation::new("rg", color.into_iter().map(Object::from).collect()),
            Operation::new("Tf", vec![font.into(), size.into()]),
            Operation::new(
                "Tm",
                vec![1.into(), 0.into(), 0.into(), 1.into(), x.into(), y.into()],
            ),
            Operation::new(
                "Tj",
                vec![Object::String(
                    fonts::encode(text),
                    StringFormat::Hexadecimal,
                )],
            ),
            Operation::new("ET", vec![]),
        ]);
    }
}
