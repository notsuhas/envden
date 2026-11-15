use crate::{chain::devices::IDeviceListState, protocol::*};
use std::collections::BTreeSet;

pub struct ISwapContext {
    pub previous: ISigned<IManifestHeader>,
    pub state: IDeviceListState,
    pub files: IFiles,
    pub request_signer: [u8; 16],
    pub missing_blobs: BTreeSet<[u8; 32]>,
    pub destination_pin: Option<[u8; 32]>,
    pub ancestor_header_hashes: BTreeSet<[u8; 32]>,
    pub repair_registration_required: bool,
}
