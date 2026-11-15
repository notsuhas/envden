use super::{access, blobs, chain, fixture::IStorageFixture, mailboxes};
pub fn storage_contract(factory: impl Fn() -> IStorageFixture) {
    for case in [
        chain::creation,
        blobs::staging,
        chain::discard,
        chain::persistence,
        chain::rollback,
        super::repair::repair,
        access::sessions,
        access::tickets,
        access::nonces,
        access::rates,
        mailboxes::slots,
        mailboxes::openings,
        mailboxes::pairing,
        blobs::blobs,
        blobs::history,
    ] {
        case(&factory());
    }
}
