use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ISigned<T> {
    pub body: T,
    pub signature: Vec<u8>,
}
impl<T: ICodec> ICodec for ISigned<T> {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        Ok(Self {
            body: T::read(r)?,
            signature: r.take(64)?.to_vec(),
        })
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.body.write(out)?;
        require_value(self.signature.len() == 64, "Invalid fixed length")?;
        out.extend(&self.signature);
        Ok(())
    }
}
