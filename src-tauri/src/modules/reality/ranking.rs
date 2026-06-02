use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::Path;

use super::index::{FileRecord, SymbolRecord};

const DAMPING: f64 = 0.85;
pub const RANK_ITERATIONS: usize = 24;

#[derive(Clone, Debug)]
pub struct FileGraphRanking {
    pub scores: HashMap<String, f64>,
    pub edge_count: usize,
}

pub fn rank_files(
    files: &[FileRecord],
    symbols: &[SymbolRecord],
    mentioned_identifiers: &HashSet<String>,
) -> FileGraphRanking {
    let paths: BTreeSet<String> = files.iter().map(|file| file.path.clone()).collect();
    let mut definitions: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut references: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    let mut display_names: BTreeMap<String, String> = BTreeMap::new();

    for symbol in symbols {
        let normalized = symbol.name.to_lowercase();
        display_names
            .entry(normalized.clone())
            .or_insert_with(|| symbol.name.clone());
        if symbol.is_definition {
            definitions
                .entry(normalized)
                .or_default()
                .insert(symbol.path.clone());
        } else {
            *references
                .entry(normalized)
                .or_default()
                .entry(symbol.path.clone())
                .or_default() += 1;
        }
    }

    let mut edges: BTreeMap<String, BTreeMap<String, f64>> = BTreeMap::new();
    let mut edge_count = 0;
    for (identifier, definers) in &definitions {
        let Some(referencers) = references.get(identifier) else {
            for definer in definers {
                add_edge(&mut edges, definer, definer, 0.1);
                edge_count += 1;
            }
            continue;
        };
        let display_name = display_names
            .get(identifier)
            .map(String::as_str)
            .unwrap_or_else(|| identifier.as_str());
        let multiplier = identifier_multiplier(
            display_name,
            mentioned_identifiers.contains(identifier),
            definers.len(),
        );
        for (referencer, reference_count) in referencers {
            for definer in definers {
                add_edge(
                    &mut edges,
                    referencer,
                    definer,
                    multiplier * (*reference_count as f64).sqrt(),
                );
                edge_count += 1;
            }
        }
    }

    FileGraphRanking {
        scores: weighted_page_rank(&paths, &edges, mentioned_identifiers),
        edge_count,
    }
}

fn add_edge(
    edges: &mut BTreeMap<String, BTreeMap<String, f64>>,
    source: &str,
    target: &str,
    weight: f64,
) {
    *edges
        .entry(source.to_string())
        .or_default()
        .entry(target.to_string())
        .or_default() += weight;
}

fn identifier_multiplier(name: &str, mentioned: bool, definition_count: usize) -> f64 {
    let mut multiplier = 1.0;
    let is_snake = name.contains('_') && name.chars().any(char::is_alphabetic);
    let is_kebab = name.contains('-') && name.chars().any(char::is_alphabetic);
    let is_camel = name.chars().any(char::is_uppercase) && name.chars().any(char::is_lowercase);
    if mentioned {
        multiplier *= 10.0;
    }
    if name.len() >= 8 && (is_snake || is_kebab || is_camel) {
        multiplier *= 10.0;
    }
    if name.starts_with('_') {
        multiplier *= 0.1;
    }
    if definition_count > 5 {
        multiplier *= 0.1;
    }
    multiplier
}

fn weighted_page_rank(
    paths: &BTreeSet<String>,
    edges: &BTreeMap<String, BTreeMap<String, f64>>,
    mentioned_identifiers: &HashSet<String>,
) -> HashMap<String, f64> {
    if paths.is_empty() {
        return HashMap::new();
    }
    let personalization = personalization(paths, mentioned_identifiers);
    let mut scores = personalization.clone();
    for _ in 0..RANK_ITERATIONS {
        let mut next: HashMap<String, f64> = personalization
            .iter()
            .map(|(path, score)| (path.clone(), (1.0 - DAMPING) * score))
            .collect();
        for source in paths {
            let rank = scores.get(source).copied().unwrap_or_default();
            let outgoing = edges.get(source);
            let total_weight = outgoing
                .map(|targets| targets.values().sum::<f64>())
                .unwrap_or_default();
            if total_weight <= f64::EPSILON {
                for (target, weight) in &personalization {
                    *next.entry(target.clone()).or_default() += DAMPING * rank * weight;
                }
                continue;
            }
            for (target, weight) in outgoing.expect("positive outgoing weight") {
                if paths.contains(target) {
                    *next.entry(target.clone()).or_default() +=
                        DAMPING * rank * weight / total_weight;
                }
            }
        }
        scores = next;
    }
    scores
}

fn personalization(
    paths: &BTreeSet<String>,
    mentioned_identifiers: &HashSet<String>,
) -> HashMap<String, f64> {
    let mut weights: HashMap<String, f64> = paths
        .iter()
        .map(|path| {
            let path = Path::new(path);
            let components: HashSet<String> = path
                .components()
                .map(|component| component.as_os_str().to_string_lossy().to_lowercase())
                .chain(
                    path.file_stem()
                        .map(|stem| stem.to_string_lossy().to_lowercase()),
                )
                .collect();
            let boost = usize::from(
                components
                    .iter()
                    .any(|component| mentioned_identifiers.contains(component)),
            ) as f64;
            (path.to_string_lossy().into_owned(), 1.0 + boost)
        })
        .collect();
    let total = weights.values().sum::<f64>();
    for weight in weights.values_mut() {
        *weight /= total;
    }
    weights
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::reality::index::ParseStatus;

    fn file(path: &str) -> FileRecord {
        FileRecord {
            path: path.to_string(),
            language: Some("typescript".to_string()),
            size: 1,
            modified_at_ms: 0,
            content_hash: None,
            parse_status: ParseStatus::Parsed,
            symbol_count: 0,
        }
    }

    fn symbol(path: &str, name: &str, is_definition: bool) -> SymbolRecord {
        SymbolRecord {
            path: path.to_string(),
            name: name.to_string(),
            kind: "function".to_string(),
            line: 1,
            is_definition,
        }
    }

    #[test]
    fn weighted_graph_lifts_a_definition_referenced_by_an_entrypoint() {
        let files = [file("entry.ts"), file("invoice.ts"), file("noise.ts")];
        let symbols = [
            symbol("entry.ts", "calculateInvoiceTotal", false),
            symbol("invoice.ts", "calculateInvoiceTotal", true),
        ];

        let ranked = rank_files(&files, &symbols, &HashSet::new());

        assert!(ranked.scores["invoice.ts"] > ranked.scores["noise.ts"]);
        assert_eq!(ranked.edge_count, 1);
    }

    #[test]
    fn applies_aider_identifier_weighting_factors() {
        assert_eq!(identifier_multiplier("calculate_total", true, 1), 100.0);
        assert_eq!(identifier_multiplier("_private_value", false, 1), 1.0);
        assert_eq!(identifier_multiplier("commonValue", false, 6), 1.0);
    }

    #[test]
    fn ranking_is_deterministic() {
        let files = [file("entry.ts"), file("invoice.ts")];
        let symbols = [
            symbol("entry.ts", "calculateInvoiceTotal", false),
            symbol("invoice.ts", "calculateInvoiceTotal", true),
        ];

        let first = rank_files(&files, &symbols, &HashSet::new());
        let second = rank_files(&files, &symbols, &HashSet::new());

        assert_eq!(first.scores, second.scores);
    }
}
