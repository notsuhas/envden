macro_rules! forward {
    ($name:ident($($arg:ident: $kind:ty),* $(,)?) -> $result:ty) => {
        fn $name(&self, $($arg: $kind),*) -> $result {
            let _guard = self.gate.lock();
            SqliteStorageAdapter::$name(self, $($arg),*)
        }
    };
}

pub(super) use forward;
