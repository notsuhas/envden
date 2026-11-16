use envden_cli::output::prompts::{choose, choose_many, consent, input, secret};
use envden_core::errors::Result;
#[cfg(unix)]
use std::process::Command;

#[test]
fn prompt_fixture() {
    let Ok(case) = std::env::var("ENVDEN_PROMPT_CASE") else {
        return;
    };
    #[cfg(unix)]
    let original = nix::sys::termios::tcgetattr(std::io::stdin()).unwrap();
    let options = [("a".into(), "Alpha".into()), ("b".into(), "Beta".into())];
    let result: Result<String> = match case.as_str() {
        "initial" | "edit" | "redirected" => {
            input("Fixture prompt", true, Some("device"), |_| None)
        }
        "progress" => {
            let progress = envden_cli::output::progress::scan_progress("Fixture scan", Some(true));
            progress.found(2);
            progress.done(1);
            Ok("done".into())
        }
        "optional" => input("Fixture prompt", false, None, |_| {
            panic!("empty validation")
        }),
        "validation" => input("Fixture prompt", true, None, |s| {
            (s != "ok").then(|| "Try again".into())
        }),
        "password" => secret("Fixture prompt", |_| None).map(|s| s.len().to_string()),
        "yes" | "no" | "cancel" | "escape" => {
            consent("Fixture prompt", case != "no").map(|v| v.to_string())
        }
        "empty" => choose_many("Fixture prompt", &[]).map(|v| v.join(",")),
        "nochoices" => choose("Fixture prompt", &[], None),
        "select" => choose("Fixture prompt", &options, Some("b")),
        "many" => choose_many("Fixture prompt", &options).map(|v| v.join(",")),
        _ => panic!("unknown fixture"),
    };
    #[cfg(unix)]
    {
        let restored = nix::sys::termios::tcgetattr(std::io::stdin()).unwrap();
        let flags = nix::sys::termios::LocalFlags::ECHO
            | nix::sys::termios::LocalFlags::ICANON
            | nix::sys::termios::LocalFlags::ISIG;
        assert_eq!(original.local_flags & flags, restored.local_flags & flags);
        assert_eq!(original.input_flags, restored.input_flags);
        assert_eq!(original.output_flags, restored.output_flags);
    }
    match result {
        Ok(value) => println!("ANSWER:{value}:END"),
        Err(error) => println!(
            "ERROR:{:?}:{}:END",
            error.code,
            envden_cli::output::error_exit_code(error.code)
        ),
    }
}

#[test]
#[cfg(unix)]
fn terminal_answers_preserve_defaults_validation_order_and_cancellation() {
    let script = r#"
import fcntl, os, pty, re, select, struct, subprocess, sys, termios
cases = [
 ('initial', b'\r', 'ANSWER:device:END'),
 ('redirected', b'\r', 'ANSWER:device:END'),
 ('edit', b'-two\r', 'ANSWER:device-two:END'),
 ('optional', b'\r', 'ANSWER::END'),
 ('validation', b'\rbad\r\x7f\x7f\x7fok\r', 'ANSWER:ok:END'),
 ('password', b'\rsensitive-fixture\r', 'ANSWER:17:END'),
 ('yes', b'\r', 'ANSWER:true:END'),
 ('no', b'\r', 'ANSWER:false:END'),
 ('yes', b'n', 'ANSWER:false:END'),
 ('no', b'y', 'ANSWER:true:END'),
 ('cancel', b'\x03', 'ERROR:InvalidInput:2:END'),
 ('escape', b'\x1b', 'ERROR:InvalidInput:2:END'),
 ('select', b'\r', 'ANSWER:b:END'),
 ('many', b'\r', 'ANSWER:a,b:END'),
 ('many', b'  \r', 'ANSWER:b,a:END'),
 ('empty', b'\r', 'ANSWER::END'),
 ('empty', b'\x03', 'ERROR:InvalidInput:2:END'),
 ('empty', b'\x1b[A\x1b[B \r', 'ANSWER::END'),
 ('nochoices', b'', 'ERROR:InvalidInput:2:END'),
 ('progress', b'', 'ANSWER:done:END'),
 ('initial', b'\x04', 'ERROR:InvalidInput:2:END'),
 ('optional', b'\x04', 'ERROR:InvalidInput:2:END'),
 ('edit', b'-two\x04', 'ERROR:InvalidInput:2:END'),
 ('password', b'\x04', 'ERROR:InvalidInput:2:END'),
 ('yes', b'\x04', 'ERROR:InvalidInput:2:END'),
 ('select', b'\x04', 'ERROR:InvalidInput:2:END'),
 ('many', b'\x04', 'ERROR:InvalidInput:2:END'),
 ('empty', b'\x04', 'ERROR:InvalidInput:2:END'),
]
for case, keys, expected in cases:
 master, slave = pty.openpty()
 fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 200, 0, 0))
 env = dict(os.environ, ENVDEN_PROMPT_CASE=case, TERM='dumb' if case == 'progress' else 'xterm-256color')
 redirected = case == "redirected"
 child = subprocess.Popen([sys.argv[1], '--exact', 'prompt_fixture', '--nocapture'],
                          stdin=slave, stdout=slave, stderr=subprocess.PIPE if redirected else slave, env=env)
 os.close(slave)
 output = b''
 sent = False
 readers = [master] + ([child.stderr.fileno()] if redirected else [])
 while readers:
  ready, _, _ = select.select(readers, [], [], 30)
  if not ready:
   child.kill()
   raise AssertionError((case, keys, 'prompt still waiting', output.decode(errors='replace')))
  for descriptor in ready:
   try:
    data = os.read(descriptor, 65536)
   except OSError:
    data = b''
   if not data:
    readers.remove(descriptor)
    continue
   output += data
   if not sent and b'Fixture prompt' in output:
    os.write(master, keys)
    sent = True
 if redirected:
  child.stderr.close()
 os.close(master)
 assert child.wait() == 0, (case, output.decode(errors='replace'))
 text = output.decode(errors='replace')
 assert expected in text, (case, expected, text)
 if case == 'edit':
  plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
  assert plain.count('◆  Fixture prompt') == 1, plain
 if case == 'progress':
  assert 'Found 1 repo with env files' in text, text
 if case == 'password':
  assert 'sensitive-fixture' not in text, 'password was visible'
 if case == 'validation':
  assert 'Required' in text and 'Try again' in text, text
"#;
    let output = Command::new("python3")
        .args(["-c", script])
        .arg(std::env::current_exe().unwrap())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn redirected_input_rejects_all_prompts_before_interaction() {
    if std::io::IsTerminal::is_terminal(&std::io::stdin()) {
        return;
    }
    let options = [("a".into(), "Alpha".into())];
    let errors = [
        input("Name", true, None, |_| None).unwrap_err(),
        secret("Password", |_| None).unwrap_err(),
        consent("Confirm", true).unwrap_err(),
        choose("Select", &options, None).unwrap_err(),
        choose_many("Many", &options).unwrap_err(),
        choose_many("Empty", &[]).unwrap_err(),
    ];
    for error in errors {
        assert_eq!(error.code, envden_core::errors::ErrorCode::InvalidInput);
        assert_eq!(envden_cli::output::error_exit_code(error.code), 2);
    }
}
