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
        "validation" | "check" => input("Fixture prompt", true, None, |s| {
            (s != "ok").then(|| "Try again".into())
        }),
        "password-edit" => secret("Fixture prompt", |_| None),
        "password" => secret("Fixture prompt", |_| None).map(|s| s.len().to_string()),
        "yes" | "no" | "toggle" | "cancel" | "escape" => {
            consent("Fixture prompt", case != "no").map(|v| v.to_string())
        }
        "empty" => choose_many("Fixture prompt", &[]).map(|v| v.join(",")),
        "nochoices" => choose("Fixture prompt", &[], None),
        "select" => choose("Fixture prompt", &options, Some("b")),
        "wrap" => choose("Fixture prompt", &options, None),
        "many" | "none" | "all" => choose_many("Fixture prompt", &options).map(|v| v.join(",")),
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

#[cfg(unix)]
const HARNESS: &str = r#"
import fcntl, os, pty, re, select, struct, subprocess, sys, termios
cases = eval(sys.argv[2])
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
  ready, _, _ = select.select(readers, [], [])
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
 if case == 'password-edit':
  plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
  assert plain.count('◆  Fixture prompt') == 1, plain
 if case == 'progress':
  assert 'Found 1 repo with env files' in text, text
 if case == 'password':
  assert 'sensitive-fixture' not in text, 'password was visible'
 if case == 'validation':
  assert 'Required' in text and 'Try again' in text, text
"#;

#[cfg(unix)]
fn assert_terminal_answers(cases: &str) {
    let output = Command::new("python3")
        .args(["-c", HARNESS])
        .arg(std::env::current_exe().unwrap())
        .arg(cases)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
#[cfg(unix)]
fn terminal_answers_preserve_defaults_keys_validation_and_cancellation() {
    assert_terminal_answers(
        r#"[
 ('initial', b'\r', 'ANSWER:device:END'),
 ('redirected', b'\r', 'ANSWER:device:END'),
 ('edit', b'-two\r', 'ANSWER:device-two:END'),
 ('edit', b'\x15new\r', 'ANSWER:new:END'),
 ('edit', b'\x01my-\x05!\r', 'ANSWER:my-device!:END'),
 ('edit', b'\x01\x06\x0b!\r', 'ANSWER:d!:END'),
 ('edit', b' two \x17!\r', 'ANSWER:device !:END'),
 ('optional', b'\r', 'ANSWER::END'),
 ('validation', b'\rbad\r\x7f\x7f\x7fok\r', 'ANSWER:ok:END'),
 ('password', b'\rsensitive-fixture\r', 'ANSWER:17:END'),
 ('yes', b'\r', 'ANSWER:true:END'),
 ('no', b'\r', 'ANSWER:false:END'),
 ('yes', b'n', 'ANSWER:false:END'),
 ('no', b'y', 'ANSWER:true:END'),
 ('toggle', b' \r', 'ANSWER:false:END'),
 ('cancel', b'\x03', 'ERROR:InvalidInput:2:END'),
 ('escape', b'\x1b', 'ERROR:InvalidInput:2:END'),
 ('select', b'\r', 'ANSWER:b:END'),
 ('wrap', b'\x1b[A\r', 'ANSWER:b:END'),
 ('many', b'\r', 'ANSWER:a,b:END'),
 ('many', b'  \r', 'ANSWER:b,a:END'),
 ('none', b'i\r', 'ANSWER::END'),
 ('empty', b'\r', 'ANSWER::END'),
 ('empty', b'\x03', 'ERROR:InvalidInput:2:END'),
 ('empty', b'\x1b[A\x1b[Bai\r', 'ANSWER::END'),
 ('password-edit', b'one two\x17!\r', 'ANSWER:one !:END'),
 ('password-edit', b'one two\x1bb!\r', 'ANSWER:one !two:END'),
 ('password-edit', b'one two\x1b[1;5D!\r', 'ANSWER:one !two:END'),
 ('password-edit', b'one two\x1b[1;3D!\r', 'ANSWER:one two!:END'),
 ('nochoices', b'', 'ERROR:InvalidInput:2:END'),
 ('none', b'a\r', 'ANSWER::END'),
 ('all', b'a a\r', 'ANSWER:a,b:END'),
 ('progress', b'', 'ANSWER:done:END'),
]"#,
    );
}

// Expected values come from @clack/prompts 1.9.0 under Bun 1.4.0, with each case written as one chunk.
#[test]
#[cfg(unix)]
fn choice_keys_match_clack_aliases() {
    assert_terminal_answers(
        r#"[
 ('yes', b'\x10\r\x03', 'ANSWER:true:END'),
 ('no', b'\x0e\r\x03', 'ANSWER:false:END'),
 ('wrap', b'\x0e\r\x03', 'ANSWER:a:END'),
 ('many', b'\x0e \r\x03', 'ANSWER:b:END'),
 ('yes', b'\x0b\r\x03', 'ANSWER:false:END'),
 ('yes', b'\x1b[1;5A\r\x03', 'ANSWER:false:END'),
 ('yes', b'\n\r\x03', 'ANSWER:false:END'),
 ('yes', b'Y\x03', 'ANSWER:true:END'),
 ('wrap', b'\x0c\r\x03', 'ANSWER:b:END'),
 ('wrap', b'\x1bOB\r\x03', 'ANSWER:b:END'),
 ('wrap', b'\n\x1b[B\r\x03', 'ANSWER:b:END'),
 ('wrap', b'j\x04\r\x03', 'ANSWER:b:END'),
 ('wrap', b'\x04\x1b[B\r\x03', 'ANSWER:b:END'),
 ('many', b'\x0c \r\x03', 'ANSWER:a:END'),
 ('many', b'\x01\r\x03', 'ANSWER::END'),
 ('many', b'A\r\x03', 'ANSWER::END'),
 ('many', b'\x1bi\r\x03', 'ANSWER::END'),
]"#,
    );
}

#[test]
#[cfg(unix)]
fn editing_keys_match_readline() {
    assert_terminal_answers(
        r#"[
 ('edit', b'\x01\x06\x15X\r\x03', 'ANSWER:Xevice:END'),
 ('edit', b'\x02\x02\x15X\r\x03', 'ANSWER:Xce:END'),
 ('edit', b'\x01\x04X\r\x03', 'ANSWER:Xevice:END'),
 ('edit', b'\x15\x04X\r\x03', 'ERROR:InvalidInput:2:END'),
 ('edit', b'-my-thing\x17X\r\x03', 'ANSWER:device-my-X:END'),
 ('edit', b' a.b\x17X\r\x03', 'ANSWER:device a.X:END'),
 ('edit', b'-my.thing\x1bbX\r\x03', 'ANSWER:device-my.Xthing:END'),
 ('edit', b' a-b\x01\x1bf\x1bfX\r\x03', 'ANSWER:device aX-b:END'),
 ('edit', b' a-b\x1b[1;5DX\r\x03', 'ANSWER:device a-Xb:END'),
 ('edit', b' a-b\x1b[1;3DX\r\x03', 'ANSWER:device a-bX:END'),
 ('edit', b' a-b\x01\x1b[1;3CX\r\x03', 'ANSWER:Xdevice a-b:END'),
 ('edit', b'\x1bOHX\x1bOFY\r\x03', 'ANSWER:XdeviceY:END'),
 ('edit', b'\x1b[1;2DX\r\x03', 'ANSWER:devicXe:END'),
 ('edit', b'\x01\x1b[3;5~X\r\x03', 'ANSWER:X:END'),
 ('edit', b'\x01\x1bdX\r\x03', 'ANSWER:X:END'),
 ('edit', b'\x1b\x08X\r\x03', 'ANSWER:X:END'),
 ('edit', b'\x02\x02\x1b[127;6uX\r\x03', 'ANSWER:deviXce:END'),
 ('edit', b'\x15\x19X\r\x03', 'ANSWER:deviceX:END'),
 ('edit', b'a\x02\x0b\x01\x0b\x19\x1by\r\x03', 'ANSWER:a:END'),
 ('edit', b'ab\x1f\x1fX\r\x03', 'ANSWER:deviceX:END'),
 ('edit', b'\t\x1f\r\x03', 'ANSWER:device\t:END'),
 ('edit', b'\x1c\r\x03', 'ANSWER:device\x1c:END'),
 ('edit', b'\nX\r\x03', 'ANSWER:X:END'),
 ('check', b'o\x01\rk\r\x03', 'ANSWER:ok:END'),
 ('check', b'o\r\x15\x1b[Ak\r\x03', 'ANSWER:ok:END'),
 ('check', b'xok\r\x15\x10\x01\x04\r\x03', 'ANSWER:ok:END'),
 ('check', b'o\x1b\r\x7fk\r\x03', 'ANSWER:ok:END'),
 ('password-edit', b'abc\x1b[D\x15X\r\x03', 'ANSWER:Xc:END'),
 ('password-edit', b'abc\x01\x04X\r\x03', 'ANSWER:Xbc:END'),
 ('password-edit', b'a-b\x1b\x7fX\r\x03', 'ANSWER:a-X:END'),
 ('password-edit', b'abc\x01\x0b\x19\x19X\r\x03', 'ANSWER:abcabcX:END'),
]"#,
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
