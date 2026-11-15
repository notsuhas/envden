use crate::adapters::IAdapters;
use envden_core::errors::Result;

pub fn run(adapters: &IAdapters) -> Result<()> {
    crate::pairing::add(adapters)
}
