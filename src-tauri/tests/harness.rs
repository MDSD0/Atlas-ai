mod common;

use common::{copy_fixture, TempDir};
use std::fs;

#[test]
fn fixture_copy_is_idempotent() {
    let (_a, pa) = copy_fixture("simple-ts");
    let (_b, pb) = copy_fixture("simple-ts");
    assert_ne!(pa, pb, "each copy gets its own temp path");
    let ga = fs::read_to_string(pa.join("greeting.ts")).unwrap();
    let gb = fs::read_to_string(pb.join("greeting.ts")).unwrap();
    assert_eq!(
        ga, gb,
        "fresh copies are byte-identical to the pristine fixture"
    );
}

#[test]
fn temp_dir_is_removed_on_drop() {
    let path;
    {
        let t = TempDir::new().unwrap();
        path = t.path().to_path_buf();
        assert!(path.exists(), "temp dir exists while guard is alive");
    }
    assert!(!path.exists(), "temp dir is removed after the guard drops");
}

#[test]
fn parallel_fixtures_do_not_share_state() {
    let (_a, pa) = copy_fixture("simple-ts");
    let (_b, pb) = copy_fixture("simple-ts");
    fs::write(pa.join("greeting.ts"), "mutated").unwrap();
    let gb = fs::read_to_string(pb.join("greeting.ts")).unwrap();
    assert_ne!(gb, "mutated", "mutating one copy does not affect another");
}
