use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use ignore::WalkBuilder;

/// Directory basenames excluded unconditionally: VCS internals, dependency
/// stores, and generated/build trees. Live updates and indexing of these cost
/// far more than they're worth and dominate scan time when present.
pub const SKIP_DIRS: &[&str] = &[
    // VCS
    ".git",
    ".hg",
    ".svn",
    ".jj",
    // JS / web
    "node_modules",
    "bower_components",
    ".pnpm-store",
    ".yarn",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".astro",
    ".vite",
    ".turbo",
    ".parcel-cache",
    ".angular",
    ".vercel",
    ".netlify",
    ".output",
    ".cache",
    // Rust
    "target",
    // Python
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".nox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".ipynb_checkpoints",
    ".eggs",
    // JVM / Gradle
    ".gradle",
    // .NET
    "obj",
    // Go / PHP
    "vendor",
    // Elixir
    "_build",
    "deps",
    // Dart / Flutter
    ".dart_tool",
    // Haskell
    "dist-newstyle",
    ".stack-work",
    // Swift / Zig
    ".build",
    "zig-cache",
    "zig-out",
    // CMake (CLion)
    "cmake-build-debug",
    "cmake-build-release",
    // IDE / coverage / infra
    ".idea",
    "coverage",
    ".nyc_output",
    ".terraform",
];

/// Default per-file size cap for content indexing/scanning. Files larger than
/// this are inventoried but not read for content (they are almost always
/// generated artifacts, vendored bundles, or media).
pub const DEFAULT_FILE_SIZE_CAP: u64 = 5 * 1024 * 1024;

/// True when a path's final component is an unconditionally skipped directory.
/// Matches on the basename only, so `/a/node_modules` is skipped but
/// `/a/node_modules/pkg` (already inside) is not re-matched here.
pub fn is_skipped_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| SKIP_DIRS.contains(&n))
}

/// Counts entries pruned by the shared policy during a walk, for transparency
/// ("skipped N generated/dependency dirs"). Cheap and thread-safe so the
/// parallel grep walker can share it.
#[derive(Default)]
pub struct SkipCounter {
    skipped_dirs: AtomicUsize,
}

impl SkipCounter {
    pub fn record_skip(&self) {
        self.skipped_dirs.fetch_add(1, Ordering::Relaxed);
    }

    pub fn skipped(&self) -> usize {
        self.skipped_dirs.load(Ordering::Relaxed)
    }
}

/// Configure a `WalkBuilder` with the shared ignore policy: honor `.gitignore`
/// and friends, never follow symlinks, and (via the caller's `filter_entry`)
/// prune the shared skip-dirs. `show_hidden` toggles dotfile visibility.
///
/// The skip-dir pruning is applied by the caller's `filter_entry` so each call
/// site can also layer its own per-entry checks (e.g. agent secret filtering);
/// use `is_skipped_dir` there. This function centralizes the gitignore/symlink
/// policy that was duplicated across search, grep, and the watcher.
pub fn configure_walk(root: &Path, show_hidden: bool) -> WalkBuilder {
    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(!show_hidden)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false);
    builder
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[test]
    fn skips_known_generated_and_vcs_dirs() {
        assert!(is_skipped_dir(Path::new("/a/b/node_modules")));
        assert!(is_skipped_dir(Path::new("/x/target")));
        assert!(is_skipped_dir(Path::new("/p/obj")));
        assert!(is_skipped_dir(Path::new("/r/.git")));
        assert!(is_skipped_dir(Path::new("/r/dist")));
    }

    #[test]
    fn keeps_source_dirs_and_nested_paths() {
        assert!(!is_skipped_dir(Path::new("/a/src")));
        // Already inside a skipped dir: basename is "pkg", not a skip dir.
        assert!(!is_skipped_dir(Path::new("/a/node_modules/pkg")));
        assert!(!is_skipped_dir(Path::new("/a/targets")));
    }

    #[test]
    fn skip_counter_is_monotonic() {
        let counter = SkipCounter::default();
        assert_eq!(counter.skipped(), 0);
        counter.record_skip();
        counter.record_skip();
        assert_eq!(counter.skipped(), 2);
    }

    #[test]
    fn shared_walk_honors_gitignore_and_generated_dir_pruning() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        std::fs::create_dir(root.join(".git")).expect("create git metadata");
        std::fs::create_dir_all(root.join("src")).expect("create src");
        std::fs::create_dir_all(root.join("ignored")).expect("create ignored");
        std::fs::create_dir_all(root.join("dist")).expect("create dist");
        std::fs::write(root.join(".gitignore"), "ignored/\n").expect("write gitignore");
        std::fs::write(root.join("src/keep.ts"), "keep").expect("write source");
        std::fs::write(root.join("ignored/drop.ts"), "drop").expect("write ignored");
        std::fs::write(root.join("dist/drop.ts"), "drop").expect("write generated");

        let skipped = Arc::new(SkipCounter::default());
        let skipped_filter = skipped.clone();
        let walker = configure_walk(root, true)
            .filter_entry(move |dent| {
                if dent.depth() > 0 && is_skipped_dir(dent.path()) {
                    skipped_filter.record_skip();
                    return false;
                }
                true
            })
            .build();

        let files: Vec<String> = walker
            .flatten()
            .filter(|dent| dent.file_type().is_some_and(|kind| kind.is_file()))
            .filter_map(|dent| dent.path().strip_prefix(root).ok().map(Path::to_path_buf))
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .collect();

        assert!(files.contains(&"src/keep.ts".to_string()));
        assert!(!files.contains(&"ignored/drop.ts".to_string()));
        assert!(!files.contains(&"dist/drop.ts".to_string()));
        assert_eq!(skipped.skipped(), 2);
    }
}
