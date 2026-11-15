use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn require_value(ok: bool, message: &'static str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(EnvdenError::new(ErrorCode::InvalidData, message))
    }
}

pub trait ICodec: Sized {
    fn read(r: &mut Reader<'_>) -> Result<Self>;
    fn write(&self, out: &mut Vec<u8>) -> Result<()>;
}

pub fn encode<T: ICodec>(value: &T) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    value.write(&mut out)?;
    Ok(out)
}

pub fn decode<T: ICodec>(data: &[u8]) -> Result<T> {
    let mut r = Reader::new(data);
    let value = T::read(&mut r)?;
    r.end()?;
    Ok(value)
}

pub struct Reader<'a> {
    pub data: &'a [u8],
    pub offset: usize,
}

impl<'a> Reader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }
    pub fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        require_value(n <= self.data.len() - self.offset, "Truncated data")?;
        let v = &self.data[self.offset..self.offset + n];
        self.offset += n;
        Ok(v)
    }
    pub fn end(&self) -> Result<()> {
        require_value(self.offset == self.data.len(), "Trailing bytes")
    }
    pub fn fixed<const N: usize>(&mut self) -> Result<[u8; N]> {
        Ok(self.take(N)?.try_into().expect("checked length"))
    }
    pub fn u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }
    pub fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_be_bytes(self.fixed()?))
    }
    pub fn u64(&mut self) -> Result<u64> {
        Ok(u64::from_be_bytes(self.fixed()?))
    }
    pub fn sized(&mut self, limit: usize) -> Result<Vec<u8>> {
        let n = self.u32()? as usize;
        require_value(n <= limit, "Length limit")?;
        Ok(self.take(n)?.to_vec())
    }
    pub fn list<T: ICodec>(&mut self) -> Result<Vec<T>> {
        let n = self.u32()? as usize;
        require_value(n <= 100000, "List limit")?;
        (0..n).map(|_| T::read(self)).collect()
    }
    pub fn opt<T: ICodec>(&mut self) -> Result<Option<T>> {
        let flag = self.u8()?;
        require_value(flag <= 1, "Invalid option")?;
        if flag == 1 {
            Ok(Some(T::read(self)?))
        } else {
            Ok(None)
        }
    }
    pub fn tagged(&mut self, tag: u8) -> Result<()> {
        let t = self.u8()?;
        let version = self.u8()?;
        if t != tag || version != 1 {
            return Err(EnvdenError::new(
                ErrorCode::UpdateRequired,
                "Unknown object format",
            ));
        }
        Ok(())
    }
}

pub fn sized(data: &[u8], limit: usize, out: &mut Vec<u8>) -> Result<()> {
    require_value(data.len() <= limit, "Length limit")?;
    out.extend((data.len() as u32).to_be_bytes());
    out.extend(data);
    Ok(())
}

pub fn list<T: ICodec>(values: &[T], out: &mut Vec<u8>) -> Result<()> {
    require_value(values.len() <= 100000, "List limit")?;
    out.extend((values.len() as u32).to_be_bytes());
    for value in values {
        value.write(out)?;
    }
    Ok(())
}

pub fn opt<T: ICodec>(value: &Option<T>, out: &mut Vec<u8>) -> Result<()> {
    out.push(u8::from(value.is_some()));
    if let Some(v) = value {
        v.write(out)?;
    }
    Ok(())
}

pub fn sorted<T, K: Ord>(values: &[T], key: impl Fn(&T) -> K) -> Result<()> {
    require_value(
        values.windows(2).all(|w| key(&w[0]) < key(&w[1])),
        "Unsorted or duplicate list",
    )
}

impl<const N: usize> ICodec for [u8; N] {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.fixed()
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        out.extend(self);
        Ok(())
    }
}

impl ICodec for u8 {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.u8()
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        out.push(*self);
        Ok(())
    }
}
