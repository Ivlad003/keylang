# 14: `keylang draft flow --mode algo`: пропозиція потоку з знімка

**Етап:** M7 · **Джерело:** design §5, §5.3; батьківський 35

**What to build:** `draft flow <trigger> --mode algo` проектує детермінований потік із call-ребер знімка від тригера й пише його як пропозицію `.keylang/proposals/<шлях>`; прийняття — через MERGE у TUI (`m`) або `--print` у stdout. Нерозв'язані виклики видно коментарем, а не кроком.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `draft flow application.purchase.buy --mode algo` дає пропозицію, яку `check` після прийняття визнає за статичними доказами
- [x] нерозв'язаний виклик не стає `step`
- [x] повторний запуск дає той самий текст

## Answer

`src/draft.ts` (`draftFlow`, `withFlow`) + `keylang draft flow <trigger>`; правила пропозицій винесено з TUI у `src/proposals.ts` (спільні для draft/MCP/code-to-spec). Прийнята пропозиція дає `static ok` на кожному кроці (тест `tests/draft.test.ts`), повтор — ті самі байти, `fmt --check` чистий; нерозв'язане — коментар, не крок.
