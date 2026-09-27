use clap::{Parser, Subcommand};
use keylang_core::{Diagnostic, Document, Item, Node};
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    name = "keylang",
    version,
    about = "keylang: architecture description bound to a repository"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Parse files (or all *.md under directories) and print the IR.
    Parse {
        #[arg(required = true)]
        paths: Vec<PathBuf>,
        /// Print the IR as JSON.
        #[arg(long)]
        json: bool,
    },
    /// Resolve IDs across all *.md files and report diagnostics.
    Check {
        #[arg(required = true)]
        paths: Vec<PathBuf>,
    },
    /// Rewrite files in canonical format.
    Fmt {
        /// Do not write; fail if a file is not formatted.
        #[arg(long)]
        check: bool,
        #[arg(required = true)]
        paths: Vec<PathBuf>,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli.cmd) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("keylang: {e}");
            ExitCode::from(2)
        }
    }
}

fn run(cmd: Cmd) -> std::io::Result<bool> {
    match cmd {
        Cmd::Parse { paths, json } => {
            let docs = keylang_core::load(&keylang_core::collect_md_files(&paths)?)?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&docs).map_err(std::io::Error::other)?
                );
            } else {
                docs.iter().for_each(print_tree);
            }
            let diags: Vec<Diagnostic> = docs.iter().flat_map(|d| d.diagnostics.clone()).collect();
            for d in &diags {
                eprintln!("{d}");
            }
            Ok(!diags.iter().any(Diagnostic::is_error))
        }
        Cmd::Check { paths } => {
            let files = keylang_core::collect_md_files(&paths)?;
            let docs = keylang_core::load(&files)?;
            let (_, resolve_diags) = keylang_core::check(&docs);
            let mut diags: Vec<Diagnostic> =
                docs.iter().flat_map(|d| d.diagnostics.clone()).collect();
            diags.extend(resolve_diags);
            diags.sort_by(|a, b| {
                (&a.file, a.span.start, a.code).cmp(&(&b.file, b.span.start, b.code))
            });
            for d in &diags {
                println!("{d}");
            }
            let errors = diags.iter().filter(|d| d.is_error()).count();
            let warnings = diags.len() - errors;
            eprintln!(
                "{} file(s): {errors} error(s), {warnings} warning(s)",
                files.len()
            );
            Ok(errors == 0)
        }
        Cmd::Fmt { check, paths } => {
            let mut ok = true;
            for file in keylang_core::collect_md_files(&paths)? {
                let src = std::fs::read_to_string(&file)?;
                match keylang_core::format_source(&file, &src) {
                    Err(diags) => {
                        ok = false;
                        diags.iter().for_each(|d| eprintln!("{d}"));
                    }
                    Ok(out) if out != src => {
                        if check {
                            ok = false;
                            println!("{}: not formatted", file.display());
                        } else {
                            std::fs::write(&file, out)?;
                            println!("{}: formatted", file.display());
                        }
                    }
                    Ok(_) => {}
                }
            }
            Ok(ok)
        }
    }
}

fn print_tree(doc: &Document) {
    let generated = if doc.generated.is_some() {
        " (generated)"
    } else {
        ""
    };
    println!("{}{generated}", doc.path.display());
    for s in &doc.sections {
        let title = s
            .heading
            .as_ref()
            .map_or("(no heading)", |h| h.value.as_str());
        println!("  [{}] {title}", s.kind.as_str());
        for item in &s.items {
            if let Item::Node(n) = item {
                print_node(n, 2);
            }
        }
    }
}

fn print_node(n: &Node, depth: usize) {
    let mut line = format!("{}{}", "  ".repeat(depth), n.kind.as_str());
    if let Some(id) = n.id.as_ref().or(n.name.as_ref().map(|s| &s.value)) {
        line.push_str(&format!(" {id}"));
    }
    if let Some(l) = &n.link {
        line.push_str(&format!(" <{}>", l.target));
    }
    if let Some(t) = &n.text {
        line.push_str(&format!(" {:?}", t.value));
    }
    if let Some(t) = &n.label {
        line.push_str(&format!(" {:?}", t.value));
    }
    if !n.refs.is_empty() {
        let refs: Vec<&str> = n.refs.iter().map(|r| r.target.as_str()).collect();
        line.push_str(&format!(" -> {}", refs.join(", ")));
    }
    println!("{line}  @{}:{}", n.span.start.line, n.span.start.col);
    for c in &n.children {
        print_node(c, depth + 1);
    }
}
