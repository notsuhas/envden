use std::path::PathBuf;

#[derive(Debug, Default)]
pub(super) struct IBases(Vec<(PathBuf, Vec<u8>)>);

impl IBases {
    pub(super) fn set(&mut self, path: PathBuf, content: Vec<u8>) {
        if let Some((_, bytes)) = self.0.iter_mut().find(|(key, _)| *key == path) {
            *bytes = content;
        } else {
            self.0.push((path, content));
        }
    }

    pub(super) fn into_entries(self) -> Vec<(PathBuf, Vec<u8>)> {
        self.0
    }

    #[cfg(test)]
    pub(super) fn as_entries(&self) -> &[(PathBuf, Vec<u8>)] {
        &self.0
    }
}
