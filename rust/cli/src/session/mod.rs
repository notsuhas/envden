mod login;
mod registration;
mod window;

pub use login::{TPassword, login};
pub use registration::register_password;
pub use window::record_unlock_window;

mod unlock;
pub use unlock::unlock_device;

#[cfg(test)]
mod tests;
