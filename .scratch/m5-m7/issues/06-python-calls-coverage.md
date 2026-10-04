# 06: Python: виклики й невизначеність методів

**Етап:** M5 · **Джерело:** design §10.7; батьківський 33

**What to build:** Виклики резолвляться через import-bindings і локальні оголошення, `Class()` — до класу, `self.m()` — до методу класу. Виклик методу через змінну без відомого типу, `getattr`, `importlib` і декоратори, що підміняють функцію, дають явну невизначеність, а не хибні ребра.

**Blocked by:** 05

**Status:** resolved

- [x] `obj.method()` без відомого типу → unresolved у покритті
- [x] `self.m()` усередині класу → ребро до методу
- [x] `importlib.import_module(x)` → unsupported з фрагментом

## Answer

`self.m()` → ребро до методу; `x.m()` і `self.attr.m()` — `dynamic-call`; `getattr`, `importlib.import_module`, `__import__`, `exec`/`eval` — `unsupported`; декоратор поза відомим списком — «decorator may replace». Виклики поза `def`/`class` — module-level code (escapes).
