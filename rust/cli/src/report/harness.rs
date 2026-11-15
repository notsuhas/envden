pub struct IHarness {
    pub id: &'static str,
    pub name: &'static str,
    pub path: String,
}

pub fn detect_harnesses(which: impl Fn(&str) -> Option<String>) -> Vec<IHarness> {
    [
        ("claude", "Claude Code"),
        ("codex", "Codex"),
        ("gemini", "Gemini CLI"),
    ]
    .into_iter()
    .filter_map(|(id, name)| which(id).map(|path| IHarness { id, name, path }))
    .collect()
}

pub fn launch_command(harness: &IHarness, prompt: &str) -> Vec<String> {
    let mut args = vec![harness.path.clone()];
    if harness.id == "gemini" {
        args.push("-i".into());
    }
    args.push(prompt.into());
    args
}
