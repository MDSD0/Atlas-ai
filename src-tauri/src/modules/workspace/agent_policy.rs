use std::path::Path;

const PROTECTED_DIRS: &[&str] = &[
    "/.ssh",
    "/.gnupg",
    "/.aws",
    "/.azure",
    "/.kube",
    "/.docker",
    "/.config/gh",
    "/.config/git",
    "/.config/gcloud",
    "/.config/op",
    "/.git",
    "/.terraform.d",
    "/library/keychains",
    "/library/cookies",
    "/etc",
    "/private/etc",
    "/proc",
    "/sys",
    "/var/db",
    "/var/root",
    "/private/var/db",
    "/private/var/root",
    "/appdata/roaming/microsoft/credentials",
    "/appdata/local/microsoft/credentials",
    "/appdata/roaming/gcloud",
];

const WRITE_DENY_PREFIXES: &[&str] = &[
    "/etc/",
    "/var/db/",
    "/var/root/",
    "/system/",
    "/library/keychains/",
    "/library/launchagents/",
    "/library/launchdaemons/",
    "/private/etc/",
    "/private/var/db/",
    "/usr/bin/",
    "/usr/sbin/",
    "/usr/local/bin/",
    "/bin/",
    "/sbin/",
    "/boot/",
    "/windows/",
    "/program files/",
    "/program files (x86)/",
    "/programdata/",
];

fn comparison_form(path: &Path) -> String {
    let mut s = path.to_string_lossy().replace('\\', "/");
    if let Some(rest) = s.strip_prefix("//?/UNC/") {
        s = format!("//{rest}");
    } else if let Some(rest) = s.strip_prefix("//?/") {
        s = rest.to_string();
    }
    if s.as_bytes().get(1) == Some(&b':') {
        s = s[2..].to_string();
    }
    let mut cleaned = Vec::new();
    for segment in s.split('/') {
        let segment = segment.split_once(':').map_or(segment, |(head, _)| head);
        cleaned.push(segment.trim_end_matches(['.', ' ']));
    }
    let mut out = cleaned.join("/").to_lowercase();
    while out.contains("//") {
        out = out.replace("//", "/");
    }
    if out.len() > 1 && out.ends_with('/') {
        out.pop();
    }
    out
}

fn basename(cmp: &str) -> &str {
    cmp.rsplit('/').next().unwrap_or(cmp)
}

fn has_secret_basename(base: &str) -> bool {
    if base == ".env" || base.starts_with(".env.") {
        return true;
    }
    if [
        ".pem",
        ".key",
        ".p12",
        ".pfx",
        ".asc",
        ".gpg",
        ".keystore",
        ".jks",
    ]
    .iter()
    .any(|suffix| base.ends_with(suffix))
    {
        return true;
    }
    if ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]
        .iter()
        .any(|prefix| {
            base == *prefix
                || base
                    .strip_prefix(prefix)
                    .is_some_and(|tail| matches!(tail.chars().next(), Some('.' | '_' | '-')))
        })
    {
        return true;
    }
    if [
        "known_hosts",
        "authorized_keys",
        "htpasswd",
        ".netrc",
        "_netrc",
        "credentials",
        ".pgpass",
        ".npmrc",
        ".pypirc",
    ]
    .contains(&base)
    {
        return true;
    }
    if [
        "secrets.json",
        "secrets.yaml",
        "secrets.yml",
        "secrets.toml",
        "secrets.env",
    ]
    .contains(&base)
        || [
            "secret.json",
            "secret.yaml",
            "secret.yml",
            "secret.toml",
            "secret.env",
        ]
        .contains(&base)
    {
        return true;
    }
    (base.starts_with("service-account") || base.starts_with("service_account"))
        && base.ends_with(".json")
}

fn is_under_protected_dir(cmp: &str) -> bool {
    let haystack = format!("/{}/", cmp.trim_matches('/'));
    PROTECTED_DIRS
        .iter()
        .any(|dir| haystack.contains(&format!("{dir}/")))
}

pub(super) fn check_readable(path: &Path) -> Result<(), String> {
    let raw = path.to_string_lossy();
    if raw.is_empty() {
        return Err("Refused: empty path.".into());
    }
    if raw.chars().any(|c| (c as u32) < 0x20) {
        return Err("Refused: path contains control bytes.".into());
    }
    let cmp = comparison_form(path);
    let base = basename(&cmp);
    if has_secret_basename(base) {
        return Err(format!(
            "Refused: \"{base}\" matches a sensitive-file pattern."
        ));
    }
    if is_under_protected_dir(&cmp) {
        return Err("Refused: path is inside a protected directory.".into());
    }
    Ok(())
}

pub(super) fn check_writable(path: &Path) -> Result<(), String> {
    check_readable(path)?;
    let cmp = comparison_form(path);
    let cmp = if cmp.starts_with('/') {
        cmp
    } else {
        format!("/{cmp}")
    };
    if WRITE_DENY_PREFIXES.iter().any(|prefix| {
        let exact = prefix.trim_end_matches('/');
        cmp == exact || cmp.starts_with(prefix)
    }) {
        return Err("Refused: writes under this system path are not allowed.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readable_rejects_secret_basenames_and_protected_dirs() {
        assert!(check_readable(Path::new("/repo/.env.local")).is_err());
        assert!(check_readable(Path::new("/repo/server.pem")).is_err());
        assert!(check_readable(Path::new("/repo/.ssh/config")).is_err());
        assert!(check_readable(Path::new("/repo/.config/gh/hosts.yml")).is_err());
    }

    #[test]
    fn readable_normalizes_windows_secret_forms() {
        assert!(check_readable(Path::new(r"C:\Users\me\.env::$DATA")).is_err());
        assert!(check_readable(Path::new(r"\\?\C:\Users\me\.SSH\config")).is_err());
    }

    #[test]
    fn readable_allows_path_segment_lookalikes() {
        assert!(check_readable(Path::new("/repo/.sshx/config")).is_ok());
        assert!(check_readable(Path::new("/repo/.gitignore-stuff/config")).is_ok());
    }

    #[test]
    fn writable_rejects_system_paths() {
        assert!(check_writable(Path::new("/usr/bin/tool")).is_err());
        assert!(check_writable(Path::new(r"C:\Windows\System32\tool.exe")).is_err());
    }
}
