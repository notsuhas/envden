use crate::protocol::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ISwap {
    pub expected_head: [u8; 32],
    pub entries: Vec<ISigned<TEntry>>,
    pub header: ISigned<IManifestHeader>,
    pub files: Option<IFiles>,
    pub keyring: Option<Vec<u8>>,
    pub envelope: Option<Vec<u8>>,
    pub sk_pub: Option<[u8; 32]>,
    pub opaque_record: Option<Vec<u8>>,
    pub approver: Option<Vec<u8>>,
}

fn read_blob(r: &mut Reader<'_>, limit: usize) -> Result<Option<Vec<u8>>> {
    let flag = r.u8()?;
    require_value(flag <= 1, "Invalid option")?;
    if flag == 0 {
        Ok(None)
    } else {
        Ok(Some(r.sized(limit)?))
    }
}

fn write_blob(v: &Option<Vec<u8>>, limit: usize, out: &mut Vec<u8>) -> Result<()> {
    out.push(u8::from(v.is_some()));
    if let Some(v) = v {
        sized(v, limit, out)?;
    }
    Ok(())
}

impl ICodec for ISwap {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        Ok(Self {
            expected_head: r.fixed()?,
            entries: r.list()?,
            header: ISigned::read(r)?,
            files: r.opt()?,
            keyring: read_blob(r, 2097152)?,
            envelope: read_blob(r, 2097152)?,
            sk_pub: r.opt()?,
            opaque_record: read_blob(r, 65536)?,
            approver: read_blob(r, 65536)?,
        })
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        out.extend(self.expected_head);
        list(&self.entries, out)?;
        self.header.write(out)?;
        opt(&self.files, out)?;
        write_blob(&self.keyring, 2097152, out)?;
        write_blob(&self.envelope, 2097152, out)?;
        opt(&self.sk_pub, out)?;
        write_blob(&self.opaque_record, 65536, out)?;
        write_blob(&self.approver, 65536, out)?;
        Ok(())
    }
}
