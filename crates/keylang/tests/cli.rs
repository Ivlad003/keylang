//! End-to-end tests: run the `keylang` binary on examples and fixtures.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// Run `keylang` with `cwd` as working directory.
fn keylang(cwd: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_keylang"))
        .current_dir(cwd)
        .args(args)
        .output()
        .expect("run keylang")
}

fn stdout(o: &Output) -> String {
    String::from_utf8(o.stdout.clone()).unwrap()
}

#[test]
fn check_shop_reports_dangling_slide_reference() {
    let o = keylang(&root(), &["check", "examples/shop"]);
    assert_eq!(o.status.code(), Some(1));
    assert_eq!(
        stdout(&o),
        "examples/shop/map.md:27:13: K001 dangling reference `domain.aggregate` \
         (did you mean `domain.orderAggregate`?)\n"
    );
}

#[test]
fn check_shop_fixed_is_clean() {
    let o = keylang(&root(), &["check", "examples/shop-fixed"]);
    assert!(o.status.success(), "{}", stdout(&o));
    assert_eq!(stdout(&o), "");
}

/// M0 criterion: the Markdown from the slides, verbatim, parses; both slide
/// mistakes are reported (misplaced `options`, `domain.aggregate`).
#[test]
fn check_verbatim_slide() {
    let o = keylang(
        Path::new(env!("CARGO_MANIFEST_DIR")),
        &["check", "tests/fixtures/slide"],
    );
    assert_eq!(o.status.code(), Some(1));
    let out = stdout(&o);
    assert!(
        out.contains("slide.md:12:11: K005 unexpected arguments after layer `options`"),
        "{out}"
    );
    assert!(
        out.contains("slide.md:15:13: K001 dangling reference `domain.aggregate`"),
        "{out}"
    );
    assert_eq!(out.lines().count(), 2, "{out}");
}

/// One fixture per diagnostic family: K002 across files, K003 indentation,
/// K004 keyword out of place, K005 bad arguments, K001 in a flow.
#[test]
fn check_diagnostics_fixture() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let o = keylang(dir, &["check", "tests/fixtures/diagnostics"]);
    assert_eq!(o.status.code(), Some(1));
    let expected =
        std::fs::read_to_string(dir.join("tests/fixtures/diagnostics.expected")).unwrap();
    assert_eq!(stdout(&o), expected);
}

#[test]
fn parse_json_shop() {
    let o = keylang(&root(), &["parse", "--json", "examples/shop"]);
    assert!(o.status.success());
    let docs: serde_json::Value = serde_json::from_str(&stdout(&o)).unwrap();
    let docs = docs.as_array().unwrap();
    let paths: Vec<&str> = docs.iter().map(|d| d["path"].as_str().unwrap()).collect();
    assert_eq!(
        paths,
        [
            "examples/shop/flows/checkout.md",
            "examples/shop/map.md",
            "examples/shop/rules.md"
        ]
    );
    let kinds: Vec<&str> = docs
        .iter()
        .map(|d| d["sections"][0]["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["flow", "map", "rules"]);

    let map = &docs[1];
    assert!(
        map["generated"]
            .as_str()
            .unwrap()
            .starts_with("<!-- keylang:generated")
    );
    // items[0] is the prose paragraph, then the four layers.
    let layer = &map["sections"][0]["items"][1];
    assert_eq!(layer["type"], "node");
    assert_eq!(layer["kind"], "layer");
    assert_eq!(layer["id"], "domain");
    let module = &layer["children"][0];
    assert_eq!(module["id"], "domain.orderAggregate");
    assert_eq!(module["link"]["path"], "src/domain/order.ts");
    assert_eq!(module["link"]["line"], 1);
    assert_eq!(module["name"]["span"]["start"]["line"], 9);
    assert_eq!(module["name"]["span"]["start"]["col"], 13);
    let create = &module["children"][0];
    assert_eq!(create["kind"], "fn");
    assert_eq!(create["text"]["value"], "(items: Item[]) → Order");
}

#[test]
fn fmt_check_passes_on_examples() {
    let o = keylang(&root(), &["fmt", "--check", "examples"]);
    assert!(o.status.success(), "{}", stdout(&o));
}

#[test]
fn fmt_canonicalizes_and_is_idempotent() {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fmt");
    let tmp = std::env::temp_dir().join(format!("keylang-fmt-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    std::fs::copy(fixtures.join("messy.md"), tmp.join("messy.md")).unwrap();

    let check = keylang(&tmp, &["fmt", "--check", "messy.md"]);
    assert_eq!(check.status.code(), Some(1));
    assert_eq!(stdout(&check), "messy.md: not formatted\n");

    assert!(keylang(&tmp, &["fmt", "messy.md"]).status.success());
    let formatted = std::fs::read_to_string(tmp.join("messy.md")).unwrap();
    let expected = std::fs::read_to_string(fixtures.join("messy.expected")).unwrap();
    assert_eq!(formatted, expected);

    let again = keylang(&tmp, &["fmt", "--check", "messy.md"]);
    assert!(
        again.status.success(),
        "fmt is not idempotent: {}",
        stdout(&again)
    );
    std::fs::remove_dir_all(&tmp).unwrap();
}

#[test]
fn fmt_refuses_bad_indentation() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let o = keylang(
        dir,
        &["fmt", "--check", "tests/fixtures/diagnostics/indent.md"],
    );
    assert_eq!(o.status.code(), Some(1));
    let err = String::from_utf8(o.stderr).unwrap();
    assert!(err.contains("K003"), "{err}");
}
