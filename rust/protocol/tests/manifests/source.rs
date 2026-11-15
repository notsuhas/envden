use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain::*, protocol::*};
use std::collections::BTreeMap;

pub struct Source {
    pub headers: BTreeMap<[u8; 32], ISigned<IManifestHeader>>,
    pub entries: BTreeMap<[u8; 32], ISigned<TEntry>>,
    pub files: IFiles,
    pub fail: Option<(&'static str, ErrorCode)>,
}

impl IChainSource for Source {
    fn header(&self, h: &[u8; 32]) -> Result<Option<ISigned<IManifestHeader>>> {
        if let Some(("header", code)) = self.fail {
            return Err(EnvdenError::new(code, "source failure"));
        }
        Ok(self.headers.get(h).cloned())
    }
    fn entry(&self, h: &[u8; 32]) -> Result<Option<ISigned<TEntry>>> {
        Ok(self.entries.get(h).cloned())
    }
    fn files(&self, _: &[u8; 32]) -> Result<Option<IFiles>> {
        if let Some(("files", code)) = self.fail {
            Err(EnvdenError::new(code, "source failure"))
        } else {
            Ok(Some(self.files.clone()))
        }
    }
    fn keyring(&self, _: &[u8; 32]) -> Result<Option<Vec<u8>>> {
        Ok(None)
    }
    fn epoch_key(&self, _: u32) -> Result<Option<[u8; 32]>> {
        Ok(None)
    }
}
