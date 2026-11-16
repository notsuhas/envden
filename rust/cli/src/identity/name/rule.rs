use envden_protocol::protocol::is_device_name;

pub const DEVICE_NAME_RULE: &str = "Device names are 1-64 bytes with no invisible characters";

pub fn device_name_problem(name: &str) -> Option<&'static str> {
    (!is_device_name(name)).then_some(DEVICE_NAME_RULE)
}
