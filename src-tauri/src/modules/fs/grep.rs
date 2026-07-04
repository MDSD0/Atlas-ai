use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use globset::{Glob, GlobSet, GlobSetBuilder};
use grep_regex::RegexMatcherBuilder;
use grep_searcher::sinks::UTF8;
use grep_searcher::{BinaryDetection, SearcherBuilder};
use ignore::WalkState;
use serde::Serialize;
use std::path::PathBuf;

use super::ignore_policy::{configure_walk, is_skipped_dir, SkipCounter, DEFAULT_FILE_SIZE_CAP};
use super::to_canon;
use crate::modules::workspace::{
    agent_path_is_readable, authorize_agent_existing_path, authorize_existing_path, WorkspaceEnv,
    WorkspaceRegistry,
};

const DEFAULT_MAX_RESULTS: usize = 200;
const HARD_MAX_RESULTS: usize = 2000;

#[derive(Serialize)]
pub struct GrepHit {
    pub path: String,
    pub rel: String,
    pub line: u64,
    pub text: String,
}

#[derive(Serialize)]
pub struct GrepResponse {
    pub hits: Vec<GrepHit>,
    pub truncated: bool,
    pub files_scanned: usize,
    pub skipped_dirs: usize,
}

fn build_globset(patterns: &[String]) -> Result<Option<GlobSet>, String> {
    if patterns.is_empty() {
        return Ok(None);
    }
    let mut b = GlobSetBuilder::new();
    for p in patterns {
        let g = Glob::new(p).map_err(|e| format!("bad glob {p:?}: {e}"))?;
        b.add(g);
    }
    let set = b.build().map_err(|e| format!("globset build: {e}"))?;
    Ok(Some(set))
}

#[tauri::command]
pub fn fs_grep(
    pattern: String,
    root: String,
    glob: Option<Vec<String>>,
    case_insensitive: Option<bool>,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<GrepResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = authorize_existing_path(&registry, &root, &workspace)?;
    fs_grep_at(
        pattern,
        root,
        root_path,
        glob,
        case_insensitive,
        max_results,
        workspace,
        false,
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn agent_fs_grep(
    pattern: String,
    root: String,
    project_root: String,
    glob: Option<Vec<String>>,
    case_insensitive: Option<bool>,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<GrepResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path =
        authorize_agent_existing_path(&registry, &root, &project_root, &workspace, false)?;
    fs_grep_at(
        pattern,
        root,
        root_path,
        glob,
        case_insensitive,
        max_results,
        workspace,
        true,
    )
}

#[allow(clippy::too_many_arguments)]
fn fs_grep_at(
    pattern: String,
    root: String,
    root_path: PathBuf,
    glob: Option<Vec<String>>,
    case_insensitive: Option<bool>,
    max_results: Option<usize>,
    workspace: WorkspaceEnv,
    filter_sensitive: bool,
) -> Result<GrepResponse, String> {
    if pattern.is_empty() {
        return Err("empty pattern".into());
    }
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let cap = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, HARD_MAX_RESULTS);

    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(case_insensitive.unwrap_or(false))
        .line_terminator(Some(b'\n'))
        .build(&pattern)
        .map_err(|e| format!("bad regex: {e}"))?;

    let globs = build_globset(glob.as_deref().unwrap_or(&[]))?;

    let skipped = Arc::new(SkipCounter::default());
    let skipped_filter = skipped.clone();
    let walker = configure_walk(&root_path, false)
        .filter_entry(move |dent| {
            if dent.depth() > 0 && is_skipped_dir(dent.path()) {
                skipped_filter.record_skip();
                return false;
            }
            !filter_sensitive || agent_path_is_readable(dent.path())
        })
        .build_parallel();

    let hits: Arc<Mutex<Vec<GrepHit>>> = Arc::new(Mutex::new(Vec::new()));
    let scanned = Arc::new(AtomicUsize::new(0));
    let truncated = Arc::new(AtomicBool::new(false));

    walker.run(|| {
        let matcher = matcher.clone();
        let globs = globs.clone();
        let hits = hits.clone();
        let scanned = scanned.clone();
        let truncated = truncated.clone();
        let root_path = root_path.clone();
        let root_display = root.clone();
        let workspace = workspace.clone();

        Box::new(move |dent_res| {
            if truncated.load(Ordering::Relaxed) {
                return WalkState::Quit;
            }
            let dent = match dent_res {
                Ok(d) => d,
                Err(_) => return WalkState::Continue,
            };
            if !dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
                return WalkState::Continue;
            }
            let path = dent.path();
            let rel = match path.strip_prefix(&root_path) {
                Ok(r) => to_canon(r),
                Err(_) => return WalkState::Continue,
            };
            if let Some(set) = globs.as_ref() {
                if !set.is_match(&rel) {
                    return WalkState::Continue;
                }
            }
            if let Ok(meta) = std::fs::metadata(path) {
                if meta.len() > DEFAULT_FILE_SIZE_CAP {
                    return WalkState::Continue;
                }
            }

            scanned.fetch_add(1, Ordering::Relaxed);

            let abs = display_path(path, &root_path, &root_display, &workspace);
            let rel_clone = rel.clone();
            let mut searcher = SearcherBuilder::new()
                .binary_detection(BinaryDetection::quit(b'\x00'))
                .line_number(true)
                .build();

            let _ = searcher.search_path(
                &matcher,
                path,
                UTF8(|line_num, text| {
                    let line_text = text.trim_end_matches('\n').to_string();
                    let mut guard = hits.lock().unwrap();
                    if guard.len() >= cap {
                        truncated.store(true, Ordering::Relaxed);
                        return Ok(false);
                    }
                    guard.push(GrepHit {
                        path: abs.clone(),
                        rel: rel_clone.clone(),
                        line: line_num,
                        text: line_text,
                    });
                    Ok(true)
                }),
            );

            WalkState::Continue
        })
    });

    let final_hits = Arc::try_unwrap(hits)
        .map(|m| m.into_inner().unwrap())
        .unwrap_or_default();

    Ok(GrepResponse {
        hits: final_hits,
        truncated: truncated.load(Ordering::Relaxed),
        files_scanned: scanned.load(Ordering::Relaxed),
        skipped_dirs: skipped.skipped(),
    })
}

#[derive(Serialize)]
pub struct GlobHit {
    pub path: String,
    pub rel: String,
}

#[derive(Serialize)]
pub struct GlobResponse {
    pub hits: Vec<GlobHit>,
    pub truncated: bool,
    pub skipped_dirs: usize,
}

#[tauri::command]
pub fn fs_glob(
    pattern: String,
    root: String,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<GlobResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = authorize_existing_path(&registry, &root, &workspace)?;
    fs_glob_at(pattern, root, root_path, max_results, workspace, false)
}

#[tauri::command]
pub fn agent_fs_glob(
    pattern: String,
    root: String,
    project_root: String,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<GlobResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path =
        authorize_agent_existing_path(&registry, &root, &project_root, &workspace, false)?;
    fs_glob_at(pattern, root, root_path, max_results, workspace, true)
}

fn fs_glob_at(
    pattern: String,
    root: String,
    root_path: PathBuf,
    max_results: Option<usize>,
    workspace: WorkspaceEnv,
    filter_sensitive: bool,
) -> Result<GlobResponse, String> {
    if pattern.is_empty() {
        return Err("empty pattern".into());
    }
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let cap = max_results.unwrap_or(500).clamp(1, HARD_MAX_RESULTS);

    let glob = Glob::new(&pattern).map_err(|e| format!("bad glob: {e}"))?;
    let mut gb = GlobSetBuilder::new();
    gb.add(glob);
    let set = gb.build().map_err(|e| format!("globset build: {e}"))?;

    let skipped = Arc::new(SkipCounter::default());
    let skipped_filter = skipped.clone();
    let walker = configure_walk(&root_path, false)
        .filter_entry(move |dent| {
            if dent.depth() > 0 && is_skipped_dir(dent.path()) {
                skipped_filter.record_skip();
                return false;
            }
            !filter_sensitive || agent_path_is_readable(dent.path())
        })
        .build();

    let mut hits: Vec<GlobHit> = Vec::new();
    let mut truncated = false;
    for dent in walker.flatten() {
        if hits.len() >= cap {
            truncated = true;
            break;
        }
        if !dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = dent.path();
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if !set.is_match(&rel) {
            continue;
        }
        hits.push(GlobHit {
            path: display_path(path, &root_path, &root, &workspace),
            rel,
        });
    }

    Ok(GlobResponse {
        hits,
        truncated,
        skipped_dirs: skipped.skipped(),
    })
}

fn display_path(
    path: &std::path::Path,
    root_path: &std::path::Path,
    root_display: &str,
    workspace: &WorkspaceEnv,
) -> String {
    if workspace.is_wsl() {
        if let Ok(rel) = path.strip_prefix(root_path) {
            let rel = to_canon(rel);
            return if rel.is_empty() {
                root_display.to_string()
            } else if root_display.ends_with('/') {
                format!("{root_display}{rel}")
            } else {
                format!("{root_display}/{rel}")
            };
        }
    }
    to_canon(path)
}

#[cfg(test)]
mod tests {
    use std::process::Command;
    use std::time::Instant;

    use super::*;

    #[test]
    fn agent_grep_and_glob_filter_sensitive_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path().to_path_buf();
        std::fs::create_dir(root.join("dist")).expect("create generated dir");
        std::fs::write(root.join("normal.txt"), "needle").expect("write normal");
        std::fs::write(root.join("server.pem"), "needle").expect("write secret");
        std::fs::write(root.join("dist/generated.txt"), "needle").expect("write generated");
        let root_s = root.to_string_lossy().into_owned();

        let app_grep = fs_grep_at(
            "needle".into(),
            root_s.clone(),
            root.clone(),
            None,
            None,
            None,
            WorkspaceEnv::Local,
            false,
        )
        .expect("app grep");
        assert_eq!(app_grep.hits.len(), 2);
        assert_eq!(app_grep.skipped_dirs, 1);

        let agent_grep = fs_grep_at(
            "needle".into(),
            root_s.clone(),
            root.clone(),
            None,
            None,
            None,
            WorkspaceEnv::Local,
            true,
        )
        .expect("agent grep");
        assert_eq!(agent_grep.hits.len(), 1);
        assert_eq!(agent_grep.hits[0].rel, "normal.txt");
        assert_eq!(agent_grep.skipped_dirs, 1);

        let app_glob = fs_glob_at(
            "**/*".into(),
            root_s.clone(),
            root.clone(),
            None,
            WorkspaceEnv::Local,
            false,
        )
        .expect("app glob");
        assert_eq!(app_glob.hits.len(), 2);
        assert_eq!(app_glob.skipped_dirs, 1);

        let agent_glob = fs_glob_at("**/*".into(), root_s, root, None, WorkspaceEnv::Local, true)
            .expect("agent glob");
        assert_eq!(agent_glob.hits.len(), 1);
        assert_eq!(agent_glob.hits[0].rel, "normal.txt");
        assert_eq!(agent_glob.skipped_dirs, 1);
    }

    #[test]
    #[ignore = "run explicitly for the M2 native grep benchmark"]
    fn benchmark_native_grep_vs_ripgrep_fixture() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path().to_path_buf();
        std::fs::create_dir(root.join(".git")).expect("create git metadata");
        std::fs::create_dir(root.join("src")).expect("create source dir");
        std::fs::create_dir(root.join("dist")).expect("create generated dir");
        std::fs::write(root.join(".gitignore"), "dist/\n").expect("write gitignore");
        std::fs::write(root.join("src/app.ts"), "needle\n".repeat(200)).expect("write source");
        std::fs::write(root.join("dist/generated.ts"), "needle\n".repeat(200))
            .expect("write generated");
        let root_s = root.to_string_lossy().into_owned();
        let iterations = 25;

        let native_start = Instant::now();
        for _ in 0..iterations {
            let result = fs_grep_at(
                "needle".into(),
                root_s.clone(),
                root.clone(),
                None,
                None,
                Some(2000),
                WorkspaceEnv::Local,
                false,
            )
            .expect("native grep");
            assert_eq!(result.hits.len(), 200);
        }
        let native_elapsed = native_start.elapsed();

        let rg_start = Instant::now();
        for _ in 0..iterations {
            let output = Command::new("rg")
                .args(["--no-heading", "--line-number", "needle", &root_s])
                .output()
                .expect("run rg");
            assert!(output.status.success());
            assert_eq!(String::from_utf8_lossy(&output.stdout).lines().count(), 200);
        }
        let rg_elapsed = rg_start.elapsed();

        eprintln!(
            "native grep {:?}; rg subprocess {:?}; iterations {}",
            native_elapsed, rg_elapsed, iterations
        );
    }
}
