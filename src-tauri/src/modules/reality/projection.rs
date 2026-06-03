use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Serialize;

use super::index::{RealitySnapshot, SymbolRecord};
use super::ranking::{rank_files, RankedFileRelation, RANK_ITERATIONS};

const MAX_MATCHES: usize = 100;
const MAX_DEGRADED_FILES: usize = 100;
const MIN_BLOCK_CHARS: usize = 24;

#[derive(Clone, Debug, Serialize)]
pub struct DegradedFile {
    pub path: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct SymbolMatch {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub line: usize,
    pub is_definition: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct RealityContextResponse {
    pub root: String,
    pub indexed_at_ms: u64,
    pub cache_hit: bool,
    pub watch_status: String,
    pub rescan_bound_ms: u64,
    pub file_count: usize,
    pub symbol_count: usize,
    pub definition_count: usize,
    pub reference_count: usize,
    pub parse_failures: usize,
    pub skipped_dirs: usize,
    pub truncated: bool,
    pub max_tokens: usize,
    pub projected_tokens: usize,
    pub naive_tokens: usize,
    pub ranking_strategy: String,
    pub graph_edge_count: usize,
    pub rank_iterations: usize,
    pub graph_relations: Vec<RankedFileRelation>,
    pub included_files: Vec<String>,
    pub excluded_files: usize,
    pub degraded_files: Vec<DegradedFile>,
    pub matches: Vec<SymbolMatch>,
    pub context: String,
}

pub fn project(
    snapshot: &RealitySnapshot,
    task: &str,
    max_tokens: usize,
    cache_hit: bool,
) -> RealityContextResponse {
    let terms = identifiers(task);
    let mut scores: HashMap<&str, f64> = snapshot
        .files
        .iter()
        .map(|file| (file.path.as_str(), 1.0))
        .collect();
    let mut mentioned_symbols = HashSet::new();

    for file in &snapshot.files {
        let path = file.path.to_lowercase();
        if terms.iter().any(|term| path.contains(term)) {
            *scores.entry(&file.path).or_default() += 20.0;
        }
    }
    for symbol in &snapshot.symbols {
        let name = symbol.name.to_lowercase();
        if terms.contains(&name) {
            mentioned_symbols.insert(name);
            *scores.entry(&symbol.path).or_default() +=
                if symbol.is_definition { 120.0 } else { 30.0 };
        }
    }
    for symbol in &snapshot.symbols {
        if mentioned_symbols.contains(&symbol.name.to_lowercase()) {
            *scores.entry(&symbol.path).or_default() +=
                if symbol.is_definition { 40.0 } else { 10.0 };
        }
    }

    let graph_ranking = rank_files(&snapshot.files, &snapshot.symbols, &terms);
    for file in &snapshot.files {
        *scores.entry(&file.path).or_default() += graph_ranking
            .scores
            .get(&file.path)
            .copied()
            .unwrap_or_default()
            * 100.0;
    }

    let mut ranked: Vec<(&str, f64)> = scores.into_iter().collect();
    ranked.sort_by(|(path_a, score_a), (path_b, score_b)| {
        score_b.total_cmp(score_a).then_with(|| path_a.cmp(path_b))
    });

    let max_chars = max_tokens.saturating_mul(4);
    let mut context = String::new();
    let mut included_files = Vec::new();
    for (path, _) in &ranked {
        let block = render_file(Path::new(&snapshot.root), path, &snapshot.symbols, &terms);
        if block.is_empty() {
            continue;
        }
        let remaining = max_chars.saturating_sub(context.chars().count());
        if remaining < MIN_BLOCK_CHARS {
            break;
        }
        let block = truncate_chars(&block, remaining);
        if block.is_empty() {
            continue;
        }
        context.push_str(&block);
        included_files.push((*path).to_string());
    }

    let mut matches: Vec<SymbolMatch> = snapshot
        .symbols
        .iter()
        .filter(|symbol| terms.contains(&symbol.name.to_lowercase()))
        .map(SymbolMatch::from)
        .collect();
    matches.sort_by(|a, b| {
        b.is_definition
            .cmp(&a.is_definition)
            .then_with(|| a.path.cmp(&b.path))
            .then_with(|| a.line.cmp(&b.line))
    });
    matches.truncate(MAX_MATCHES);

    let degraded_files = snapshot
        .files
        .iter()
        .filter(|file| file.parse_status.is_degraded())
        .take(MAX_DEGRADED_FILES)
        .map(|file| DegradedFile {
            path: file.path.clone(),
            status: file.parse_status.as_str().to_string(),
        })
        .collect();
    let definition_count = snapshot
        .symbols
        .iter()
        .filter(|symbol| symbol.is_definition)
        .count();

    RealityContextResponse {
        root: snapshot.root.clone(),
        indexed_at_ms: snapshot.indexed_at_ms,
        cache_hit,
        watch_status: "not_registered".to_string(),
        rescan_bound_ms: super::MAX_CACHE_AGE_MS,
        file_count: snapshot.files.len(),
        symbol_count: snapshot.symbols.len(),
        definition_count,
        reference_count: snapshot.symbols.len() - definition_count,
        parse_failures: snapshot.parse_failures,
        skipped_dirs: snapshot.skipped_dirs,
        truncated: snapshot.truncated,
        max_tokens,
        projected_tokens: context.chars().count().div_ceil(4),
        naive_tokens: snapshot.naive_tokens,
        ranking_strategy: "aider_weighted_pagerank".to_string(),
        graph_edge_count: graph_ranking.edge_count,
        rank_iterations: RANK_ITERATIONS,
        graph_relations: graph_ranking.relations,
        included_files: included_files.clone(),
        excluded_files: ranked.len().saturating_sub(included_files.len()),
        degraded_files,
        matches,
        context,
    }
}

fn identifiers(task: &str) -> HashSet<String> {
    task.split(|ch: char| !ch.is_alphanumeric() && ch != '_' && ch != '-')
        .filter(|term| term.len() >= 3)
        .map(str::to_lowercase)
        .collect()
}

fn render_file(
    root: &Path,
    path: &str,
    symbols: &[SymbolRecord],
    terms: &HashSet<String>,
) -> String {
    let Ok(source) = std::fs::read_to_string(root.join(path)) else {
        return String::new();
    };
    let lines: Vec<&str> = source.lines().collect();
    let file_symbols: Vec<&SymbolRecord> = symbols
        .iter()
        .filter(|symbol| symbol.path == path)
        .collect();
    let mut selected: Vec<&SymbolRecord> = file_symbols
        .iter()
        .copied()
        .filter(|symbol| terms.contains(&symbol.name.to_lowercase()))
        .collect();
    if selected.is_empty() {
        selected.extend(
            file_symbols
                .iter()
                .copied()
                .filter(|symbol| symbol.is_definition)
                .take(4),
        );
    }
    let mut line_numbers = HashSet::new();
    for symbol in selected {
        let line = symbol.line.saturating_sub(1);
        line_numbers.insert(line.saturating_sub(1));
        line_numbers.insert(line);
        line_numbers.insert(line + 1);
    }
    if line_numbers.is_empty() {
        line_numbers.extend(0..lines.len().min(3));
    }
    let mut line_numbers: Vec<usize> = line_numbers.into_iter().collect();
    line_numbers.sort_unstable();

    let mut out = format!("\n{path}:\n");
    for line in line_numbers {
        if let Some(text) = lines.get(line) {
            out.push_str(&format!("  {}: {}\n", line + 1, text));
        }
    }
    out
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

impl From<&SymbolRecord> for SymbolMatch {
    fn from(symbol: &SymbolRecord) -> Self {
        Self {
            path: symbol.path.clone(),
            name: symbol.name.clone(),
            kind: symbol.kind.clone(),
            line: symbol.line,
            is_definition: symbol.is_definition,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::modules::reality::index::{build_snapshot, ParseStatus};

    #[test]
    fn projection_is_budgeted_and_prefers_mentioned_symbol_relations() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            dir.path().join("cart.ts"),
            "export function calculateTotal() { return 1; }\n",
        )
        .expect("write cart");
        std::fs::write(
            dir.path().join("caller.ts"),
            "import { calculateTotal } from './cart';\nexport const total = calculateTotal();\n",
        )
        .expect("write caller");
        std::fs::write(
            dir.path().join("archive.ts"),
            "export function calculateTotalLegacy() { return 0; }\n",
        )
        .expect("write archive");
        let snapshot = build_snapshot(dir.path()).expect("snapshot");

        let result = project(&snapshot, "fix calculateTotal", 32, false);

        assert!(result.projected_tokens <= 32);
        assert_eq!(
            result.included_files.first().map(String::as_str),
            Some("cart.ts")
        );
        assert!(result
            .matches
            .iter()
            .any(|symbol| symbol.path == "cart.ts" && symbol.is_definition));
        assert!(result
            .graph_relations
            .iter()
            .any(|relation| relation.source == "caller.ts"
                && relation.target == "cart.ts"
                && relation.symbol == "calculateTotal"));
    }

    #[test]
    fn partial_parse_is_visible_in_projection() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("broken.ts"), "export function broken( {\n")
            .expect("write malformed source");
        let snapshot = build_snapshot(dir.path()).expect("snapshot");

        let result = project(&snapshot, "broken", 128, false);

        assert_eq!(result.parse_failures, 1);
        assert_eq!(
            result.degraded_files[0].status,
            ParseStatus::Partial.as_str()
        );
    }

    #[test]
    fn mixed_stack_fixture_meets_first_projection_gate() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri parent")
            .join("tests/fixtures/mixed-stack");
        let snapshot = build_snapshot(&root).expect("snapshot");
        let languages: HashSet<&str> = snapshot
            .files
            .iter()
            .filter_map(|file| file.language.as_deref())
            .collect();
        let result = project(&snapshot, "fix calculateTotal checkout", 48, false);
        let expected = ["src/cart.ts", "src/main.ts"];
        let recalled = expected
            .iter()
            .filter(|path| result.included_files.iter().any(|actual| actual == *path))
            .count();

        assert!(languages.contains("typescript"));
        assert!(languages.contains("tsx"));
        assert!(languages.contains("python"));
        assert!(languages.contains("rust"));
        assert!(recalled as f32 / expected.len() as f32 >= 0.85);
        assert_eq!(
            result
                .matches
                .iter()
                .find(|symbol| symbol.is_definition)
                .map(|symbol| symbol.path.as_str()),
            Some("src/cart.ts")
        );
        assert!(!result
            .included_files
            .contains(&"archive/cart.ts".to_string()));
        assert!(result.projected_tokens * 100 <= result.naive_tokens * 40);

        // Surface the measured go/no-go numbers so "we measured it" is itself
        // provable (run with --nocapture; the release qualifier parses this).
        let recall = recalled as f32 / expected.len() as f32;
        let token_ratio = (result.projected_tokens as f32 / result.naive_tokens.max(1) as f32)
            * 100.0;
        let wrong_file_hits = result
            .included_files
            .iter()
            .filter(|path| path.as_str() == "archive/cart.ts")
            .count();
        println!(
            "ATLAS_GO_NO_GO {{\"recall\":{:.2},\"token_ratio_pct\":{:.1},\"wrong_file_hits\":{},\"projected_tokens\":{},\"naive_tokens\":{}}}",
            recall, token_ratio, wrong_file_hits, result.projected_tokens, result.naive_tokens
        );
    }
}
