use super::super::data::*;
use envden_core::errors::Result;

impl IMemory {
    pub(in crate::storage::memory) fn close(&self) -> Result<()> {
        Ok(())
    }

    pub(in crate::storage::memory) fn transaction(
        &self,
        run: &mut dyn FnMut() -> Result<()>,
    ) -> Result<()> {
        let guard = self.data.lock();
        let snapshot = guard.borrow().clone();
        guard.borrow_mut().depth += 1;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run));
        match result {
            Ok(Ok(())) => {
                guard.borrow_mut().depth -= 1;
                Ok(())
            }
            Ok(Err(e)) => {
                *guard.borrow_mut() = snapshot;
                Err(e)
            }
            Err(p) => {
                *guard.borrow_mut() = snapshot;
                std::panic::resume_unwind(p)
            }
        }
    }
}
