use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tree_sitter::Language;
use tree_sitter_tags::{TagsConfiguration, TagsContext};

use crate::modules::fs::ignore_policy::{
    configure_walk, is_skipped_dir, SkipCounter, DEFAULT_FILE_SIZE_CAP,
};
use crate::modules::fs::to_canon;
use crate::modules::workspace::agent_path_is_readable;

const MAX_FILES: usize = 20_000;
const MAX_SYMBOLS: usize = 100_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ParseStatus {
    Parsed,
    Partial,
    Unsupported,
    TooLarge,
    Binary,
    ReadError,
    TagError,
}

impl ParseStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Parsed => "parsed",
            Self::Partial => "partial",
            Self::Unsupported => "unsupported",
            Self::TooLarge => "too_large",
            Self::Binary => "binary",
            Self::ReadError => "read_error",
            Self::TagError => "tag_error",
        }
    }

    pub fn is_degraded(&self) -> bool {
        !matches!(self, Self::Parsed | Self::Unsupported)
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct FileRecord {
    pub path: String,
    pub language: Option<String>,
    pub size: u64,
    pub modified_at_ms: u64,
    pub content_hash: Option<String>,
    pub parse_status: ParseStatus,
    pub symbol_count: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct SymbolRecord {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub line: usize,
    pub is_definition: bool,
}

#[derive(Clone, Debug)]
pub struct RealitySnapshot {
    pub root: String,
    pub indexed_at_ms: u64,
    pub files: Vec<FileRecord>,
    pub symbols: Vec<SymbolRecord>,
    pub skipped_dirs: usize,
    pub truncated: bool,
    pub parse_failures: usize,
    pub naive_tokens: usize,
}

#[derive(Clone, Copy)]
enum LanguageKind {
    JavaScript,
    TypeScript,
    Tsx,
    Python,
    Rust,
}

impl LanguageKind {
    fn from_path(path: &Path) -> Option<Self> {
        match path.extension().and_then(|ext| ext.to_str())? {
            "js" | "jsx" | "mjs" | "cjs" => Some(Self::JavaScript),
            "ts" | "mts" | "cts" => Some(Self::TypeScript),
            "tsx" => Some(Self::Tsx),
            "py" => Some(Self::Python),
            "rs" => Some(Self::Rust),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::JavaScript => "javascript",
            Self::TypeScript => "typescript",
            Self::Tsx => "tsx",
            Self::Python => "python",
            Self::Rust => "rust",
        }
    }
}

struct Extractors {
    context: TagsContext,
    javascript: TagsConfiguration,
    typescript: TagsConfiguration,
    tsx: TagsConfiguration,
    python: TagsConfiguration,
    rust: TagsConfiguration,
}

impl Extractors {
    fn new() -> Result<Self, String> {
        let typescript_tags = format!(
            "{}\n{}",
            tree_sitter_javascript::TAGS_QUERY,
            tree_sitter_typescript::TAGS_QUERY
        );
        let typescript_locals = format!(
            "{}\n{}",
            tree_sitter_javascript::LOCALS_QUERY,
            tree_sitter_typescript::LOCALS_QUERY
        );
        Ok(Self {
            context: TagsContext::new(),
            javascript: tags_configuration(
                tree_sitter_javascript::LANGUAGE.into(),
                tree_sitter_javascript::TAGS_QUERY,
                tree_sitter_javascript::LOCALS_QUERY,
            )?,
            typescript: tags_configuration(
                tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
                &typescript_tags,
                &typescript_locals,
            )?,
            tsx: tags_configuration(
                tree_sitter_typescript::LANGUAGE_TSX.into(),
                &typescript_tags,
                &typescript_locals,
            )?,
            python: tags_configuration(
                tree_sitter_python::LANGUAGE.into(),
                tree_sitter_python::TAGS_QUERY,
                "",
            )?,
            rust: tags_configuration(
                tree_sitter_rust::LANGUAGE.into(),
                tree_sitter_rust::TAGS_QUERY,
                "",
            )?,
        })
    }

    fn extract(
        &mut self,
        language: LanguageKind,
        path: &str,
        source: &[u8],
    ) -> Result<(Vec<SymbolRecord>, bool), String> {
        let config = match language {
            LanguageKind::JavaScript => &self.javascript,
            LanguageKind::TypeScript => &self.typescript,
            LanguageKind::Tsx => &self.tsx,
            LanguageKind::Python => &self.python,
            LanguageKind::Rust => &self.rust,
        };
        let (tags, has_parse_error) = self
            .context
            .generate_tags(config, source, None)
            .map_err(|e| e.to_string())?;
        let mut symbols = Vec::new();
        for tag in tags {
            let tag = tag.map_err(|e| e.to_string())?;
            symbols.push(SymbolRecord {
                path: path.to_string(),
                name: String::from_utf8_lossy(&source[tag.name_range]).into_owned(),
                kind: config.syntax_type_name(tag.syntax_type_id).to_string(),
                line: tag.span.start.row + 1,
                is_definition: tag.is_definition,
            });
        }
        Ok((symbols, has_parse_error))
    }
}

fn tags_configuration(
    language: Language,
    tags_query: &str,
    locals_query: &str,
) -> Result<TagsConfiguration, String> {
    TagsConfiguration::new(language, tags_query, locals_query).map_err(|e| e.to_string())
}

pub fn build_snapshot(root: &Path) -> Result<RealitySnapshot, String> {
    let mut extractors = Extractors::new()?;
    let skipped = Arc::new(SkipCounter::default());
    let skipped_filter = skipped.clone();
    let walker = configure_walk(root, false)
        .filter_entry(move |dent| {
            if dent.depth() > 0 && is_skipped_dir(dent.path()) {
                skipped_filter.record_skip();
                return false;
            }
            agent_path_is_readable(dent.path())
        })
        .build();

    let mut files = Vec::new();
    let mut symbols = Vec::new();
    let mut truncated = false;
    let mut parse_failures = 0;
    let mut naive_bytes = 0;

    for dent in walker.flatten() {
        if files.len() >= MAX_FILES || symbols.len() >= MAX_SYMBOLS {
            truncated = true;
            break;
        }
        if !dent.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let path = dent.path();
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let rel = to_canon(rel);
        let Ok(metadata) = dent.metadata() else {
            continue;
        };
        let language = LanguageKind::from_path(path);
        let mut record = FileRecord {
            path: rel.clone(),
            language: language.map(|kind| kind.as_str().to_string()),
            size: metadata.len(),
            modified_at_ms: modified_at_ms(metadata.modified().ok()),
            content_hash: None,
            parse_status: ParseStatus::Unsupported,
            symbol_count: 0,
        };
        let Some(language) = language else {
            files.push(record);
            continue;
        };
        if metadata.len() > DEFAULT_FILE_SIZE_CAP {
            record.parse_status = ParseStatus::TooLarge;
            parse_failures += 1;
            files.push(record);
            continue;
        }
        let source = match std::fs::read(path) {
            Ok(source) => source,
            Err(_) => {
                record.parse_status = ParseStatus::ReadError;
                parse_failures += 1;
                files.push(record);
                continue;
            }
        };
        record.content_hash = Some(content_hash(&source));
        if source.contains(&0) {
            record.parse_status = ParseStatus::Binary;
            parse_failures += 1;
            files.push(record);
            continue;
        }
        naive_bytes += source.len();
        match extractors.extract(language, &rel, &source) {
            Ok((mut extracted, has_parse_error)) => {
                record.parse_status = if has_parse_error {
                    parse_failures += 1;
                    ParseStatus::Partial
                } else {
                    ParseStatus::Parsed
                };
                record.symbol_count = extracted.len();
                if symbols.len() + extracted.len() > MAX_SYMBOLS {
                    extracted.truncate(MAX_SYMBOLS - symbols.len());
                    truncated = true;
                }
                symbols.extend(extracted);
            }
            Err(_) => {
                record.parse_status = ParseStatus::TagError;
                parse_failures += 1;
            }
        }
        files.push(record);
    }

    Ok(RealitySnapshot {
        root: to_canon(root),
        indexed_at_ms: now_ms(),
        files,
        symbols,
        skipped_dirs: skipped.skipped(),
        truncated,
        parse_failures,
        naive_tokens: naive_bytes.div_ceil(4),
    })
}

fn modified_at_ms(modified: Option<SystemTime>) -> u64 {
    modified
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn now_ms() -> u64 {
    modified_at_ms(Some(SystemTime::now()))
}

fn content_hash(content: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in content {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definitions(symbols: &[SymbolRecord]) -> Vec<&str> {
        symbols
            .iter()
            .filter(|symbol| symbol.is_definition)
            .map(|symbol| symbol.name.as_str())
            .collect()
    }

    #[test]
    fn wraps_official_tags_queries_for_first_languages() {
        let mut extractors = Extractors::new().expect("extractors");
        let cases = [
            (
                LanguageKind::JavaScript,
                "app.js",
                "export function double(x) { return x * 2; }\n",
                "double",
            ),
            (
                LanguageKind::TypeScript,
                "app.ts",
                "export function double(x: number): number { return x * 2; }\n",
                "double",
            ),
            (
                LanguageKind::Tsx,
                "app.tsx",
                "export function Panel() { return <div />; }\n",
                "Panel",
            ),
            (
                LanguageKind::Python,
                "app.py",
                "def double(x):\n    return x * 2\n",
                "double",
            ),
            (
                LanguageKind::Rust,
                "app.rs",
                "fn double(x: i32) -> i32 { x * 2 }\n",
                "double",
            ),
        ];
        for (language, path, source, expected) in cases {
            let (symbols, has_error) = extractors
                .extract(language, path, source.as_bytes())
                .expect("extract tags");
            assert!(!has_error, "{path} should parse cleanly");
            assert!(
                definitions(&symbols).contains(&expected),
                "{path} should define {expected}: {symbols:?}"
            );
        }
    }

    #[test]
    fn snapshot_excludes_generated_ignored_and_secret_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        std::fs::create_dir(root.join(".git")).expect("create git metadata");
        std::fs::create_dir(root.join("dist")).expect("create dist");
        std::fs::create_dir(root.join("ignored")).expect("create ignored");
        std::fs::write(root.join(".gitignore"), "ignored/\n").expect("write gitignore");
        std::fs::write(root.join("app.ts"), "export function keep() {}\n").expect("write source");
        std::fs::write(root.join("dist/drop.ts"), "export function drop() {}\n")
            .expect("write generated");
        std::fs::write(root.join("ignored/drop.ts"), "export function drop() {}\n")
            .expect("write ignored");
        std::fs::write(root.join(".env.ts"), "export function secret() {}\n")
            .expect("write secret");

        let snapshot = build_snapshot(root).expect("snapshot");
        let files: Vec<&str> = snapshot
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect();
        assert!(files.contains(&"app.ts"));
        assert!(!files.contains(&"dist/drop.ts"));
        assert!(!files.contains(&"ignored/drop.ts"));
        assert!(!files.contains(&".env.ts"));
        assert_eq!(snapshot.skipped_dirs, 1);
    }

    #[test]
    fn parse_error_is_explicit_and_non_fatal() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("broken.ts"), "export function broken( {\n")
            .expect("write malformed source");

        let snapshot = build_snapshot(dir.path()).expect("snapshot");
        assert_eq!(snapshot.files.len(), 1);
        assert_eq!(snapshot.files[0].parse_status, ParseStatus::Partial);
        assert_eq!(snapshot.parse_failures, 1);
    }
}
