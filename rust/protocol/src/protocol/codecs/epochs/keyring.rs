use crate::protocol::{codecs::IOlderKey, encoding::*};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IKeyring {
    pub vault_id: [u8; 32],
    pub epoch: u32,
    pub id_key: [u8; 32],
    pub older: Vec<IOlderKey>,
}

impl IKeyring {
    fn validate(&self) -> Result<()> {
        require_value(
            self.epoch >= 1
                && self.older.len() == self.epoch as usize - 1
                && self
                    .older
                    .iter()
                    .enumerate()
                    .all(|(i, k)| k.epoch as usize == i + 1),
            "Noncontiguous epochs",
        )?;
        sorted(&self.older, |v| v.epoch)?;
        Ok(())
    }
}

impl ICodec for IKeyring {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(4)?;
        let value = Self {
            vault_id: r.fixed()?,
            epoch: r.u32()?,
            id_key: r.fixed()?,
            older: r.list()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([4, 1]);
        out.extend(self.vault_id);
        out.extend(self.epoch.to_be_bytes());
        out.extend(self.id_key);
        list(&self.older, out)?;
        Ok(())
    }
}
