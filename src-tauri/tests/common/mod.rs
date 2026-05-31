#![allow(dead_code)]
use std::fs;
use std::path::{Path, PathBuf};

pub use tempfile::TempDir;

pub fn fixtures_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent")
        .join("tests/fixtures")
}

fn copy_tree(src: &Path, dst: &Path) {
    fs::create_dir_all(dst).expect("create dst dir");
    for entry in fs::read_dir(src).expect("read fixture dir") {
        let entry = entry.expect("dir entry");
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_tree(&from, &to);
        } else {
            fs::copy(&from, &to).expect("copy file");
        }
    }
}

/// Copy a pristine fixture into a fresh temp dir. Returns the temp guard and the
/// path to the copied fixture root. Drop the guard to clean up.
pub fn copy_fixture(name: &str) -> (TempDir, PathBuf) {
    let temp = TempDir::new().expect("create temp dir");
    let dst = temp.path().join(name);
    let src = fixtures_dir().join(name);
    assert!(src.is_dir(), "fixture not found: {}", src.display());
    copy_tree(&src, &dst);
    (temp, dst)
}
