<?php

/**
 * keylang trace adapter for PHP: records the functions of one flow as JSONL (schema 1).
 *
 *     keylang trace-plan <flow> > plan.json
 *     KEYLANG_TRACE=.keylang/trace/<flow>.jsonl KEYLANG_TRACE_PLAN=plan.json \
 *     KEYLANG_TRACE_TEST="<test id>" php keylang_trace.php <script> [args...]
 *
 * or loaded before any other file, under a test runner:
 *
 *     php -d auto_prepend_file=keylang_trace.php vendor/bin/phpunit
 *
 * Environment:
 *     KEYLANG_TRACE        JSONL file to append to; without it nothing is recorded
 *     KEYLANG_TRACE_PLAN   plan from `keylang trace-plan <flow>` (required)
 *     KEYLANG_TRACE_TEST   test id (required unless keylang's PHPUnit extension names each test)
 *     KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
 *     KEYLANG_TRACE_ROOT   repository root the plan's paths are relative to (default: cwd)
 *
 * PHP calls no hook on a function call without an extension, so the adapter
 * instruments source. While it runs, `file://` is its own stream wrapper: a
 * planned file included with the content the snapshot saw is served with a
 * span around the body of each planned function or method, on the same lines,
 * so line numbers and stack traces do not move. Every other file passes
 * through untouched. A function is the plan's when its file, name and first
 * line are the ones the plan gives: a method of the same name in another class
 * is not it. A generator (a body with `yield`) is not instrumented: its frames
 * suspend and resume, so a call stack does not give its nesting. Spans nest by
 * the call stack. A fatal error or an uncaught exception, or a span still open
 * when the process ends, makes the run incomplete. Under a test runner each
 * test that reaches a planned function is a run of the flow; a test that
 * reaches none ran something else and records nothing. Needs PHP 8.1 or newer with
 * the tokenizer extension, and OPcache off for the CLI (its default).
 */

declare(strict_types=1);

if (!class_exists('KeylangTrace', false)) {
    final class KeylangTrace
    {
        private const SCHEMA = 1;

        private static ?self $active = null;

        /** @var array<string, string> real path → the instrumented source of a planned file */
        private array $served = [];
        /** @var array<string, string> real path → the sha256 the plan expects */
        private array $hashes = [];
        /** @var list<string> */
        private array $instrumented = [];
        /** @var list<string> */
        private array $lines = [];
        /** @var list<array{span: string, failed: bool}> */
        private array $stack = [];
        /** @var array<string, true> */
        private array $open = [];
        private int $seq = 0;
        private int $spans = 0;
        /** Spans the current test started: a test that reaches no planned function is no run of the flow. */
        private int $reached = 0;
        private bool $written = false;

        private function __construct(
            private readonly string $output,
            private readonly string $flow,
            private readonly string $snapshot,
            private readonly string $run,
            private readonly string $clock,
            private ?string $test,
        ) {
        }

        /** Reads the environment and starts recording; without `KEYLANG_TRACE` it does nothing. */
        public static function install(): void
        {
            if (self::$active !== null) {
                return;
            }
            $output = getenv('KEYLANG_TRACE');
            if ($output === false || $output === '') {
                return;
            }
            $planPath = getenv('KEYLANG_TRACE_PLAN');
            if ($planPath === false || $planPath === '') {
                self::fail('KEYLANG_TRACE_PLAN is required with KEYLANG_TRACE');
            }
            $text = @file_get_contents($planPath);
            if ($text === false) {
                self::fail("{$planPath}: cannot read the plan");
            }
            $plan = json_decode($text, true);
            if (!is_array($plan) || ($plan['schemaVersion'] ?? null) !== 1 || !is_array($plan['symbols'] ?? null) || !is_string($plan['snapshotId'] ?? null) || !is_string($plan['flow'] ?? null)) {
                self::fail("{$planPath}: not a plan of schema 1 from `keylang trace-plan`");
            }
            $root = getenv('KEYLANG_TRACE_ROOT');
            $root = realpath($root !== false && $root !== '' ? $root : getcwd());
            if ($root === false) {
                self::fail('KEYLANG_TRACE_ROOT is not a directory');
            }
            $test = getenv('KEYLANG_TRACE_TEST');
            $run = getenv('KEYLANG_TRACE_RUN');
            $run = $run !== false && $run !== '' ? $run : dechex((int) (microtime(true) * 1000)) . '-' . getmypid();
            // Child processes inherit the id, so the processes of one test are one run.
            putenv("KEYLANG_TRACE_RUN={$run}");
            $trace = new self($output, $plan['flow'], $plan['snapshotId'], $run, 'php-' . getmypid() . '-' . bin2hex(random_bytes(4)), $test !== false && $test !== '' ? $test : null);
            $trace->prepare($plan['symbols'], $root);
            self::$active = $trace;
            register_shutdown_function([$trace, 'finish']);
            KeylangTraceStream::register();
        }

        /** The run id of the recording, null when nothing is recorded. */
        public static function runId(): ?string
        {
            return self::$active?->run;
        }

        /** The test that runs from now on: the one before it gets its `run` record. */
        public static function test(string $id): void
        {
            $trace = self::$active;
            if ($trace === null) {
                return;
            }
            if ($trace->test !== null) {
                $trace->record(false);
            }
            $trace->test = $id;
        }

        /** The current test ended: its `run` record is written now. */
        public static function testEnd(): void
        {
            $trace = self::$active;
            if ($trace === null || $trace->test === null) {
                return;
            }
            $trace->record(false);
            $trace->test = null;
        }

        /** A planned function started: its span, on top of the spans of the calls around it. */
        public static function start(string $symbol): string
        {
            $trace = self::$active;
            if ($trace === null) {
                return '';
            }
            $span = $trace->clock . ':s' . ++$trace->spans;
            $trace->reached++;
            $parent = $trace->stack === [] ? null : $trace->stack[count($trace->stack) - 1]['span'];
            $trace->event(['event' => 'start', 'spanId' => $span, 'parentSpanId' => $parent, 'symbolId' => $symbol, 'clockId' => $trace->clock, 'seq' => ++$trace->seq, 'ts' => hrtime(true) / 1e6]);
            $trace->stack[] = ['span' => $span, 'failed' => false];
            $trace->open[$span] = true;
            return $span;
        }

        /** The span's function is leaving by an exception. */
        public static function failed(string $span): void
        {
            $trace = self::$active;
            if ($trace === null) {
                return;
            }
            foreach ($trace->stack as $at => $entry) {
                if ($entry['span'] === $span) {
                    $trace->stack[$at]['failed'] = true;
                }
            }
        }

        /** The span's function returned or threw. */
        public static function end(string $span): void
        {
            $trace = self::$active;
            if ($trace === null || $span === '') {
                return;
            }
            $failed = false;
            while ($trace->stack !== []) {
                $entry = array_pop($trace->stack);
                if ($entry['span'] === $span) {
                    $failed = $entry['failed'];
                    break;
                }
            }
            unset($trace->open[$span]);
            $trace->event(['event' => 'end', 'spanId' => $span, 'outcome' => $failed ? 'error' : 'ok', 'clockId' => $trace->clock, 'seq' => ++$trace->seq, 'ts' => hrtime(true) / 1e6]);
        }

        /** The instrumented source of a planned file still as the plan saw it; null for any other file. */
        public static function served(string $path): ?string
        {
            $trace = self::$active;
            if ($trace === null) {
                return null;
            }
            $real = KeylangTraceStream::native(static fn () => realpath($path));
            if (!is_string($real) || !isset($trace->served[$real])) {
                return null;
            }
            $content = KeylangTraceStream::native(static fn () => @file_get_contents($real));
            // A file changed since the process started is served as it is now.
            return is_string($content) && hash('sha256', $content) === $trace->hashes[$real] ? $trace->served[$real] : null;
        }

        /** The `run` record of the last test, then everything to the output file. */
        public function finish(): void
        {
            if ($this->written) {
                return;
            }
            $error = error_get_last();
            $crashed = $error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR], true);
            if ($this->test !== null) {
                $this->record($crashed);
            }
            $this->written = true;
            KeylangTraceStream::unregister();
            $dir = dirname($this->output);
            if (!is_dir($dir)) {
                @mkdir($dir, 0777, true);
            }
            if ($this->lines !== []) {
                file_put_contents($this->output, implode("\n", $this->lines) . "\n", FILE_APPEND | LOCK_EX);
            }
        }

        /**
         * The planned functions whose file still has the content the snapshot
         * saw, found in its tokens: their instrumented source, kept for the
         * moment the file is included.
         *
         * @param list<mixed> $symbols
         */
        private function prepare(array $symbols, string $root): void
        {
            $byFile = [];
            foreach ($symbols as $symbol) {
                if (!is_array($symbol) || !is_string($symbol['id'] ?? null) || !is_string($symbol['name'] ?? null) || !is_string($symbol['file'] ?? null) || !is_int($symbol['line'] ?? null) || !is_string($symbol['sha256'] ?? null)) {
                    continue;
                }
                $real = realpath($root . DIRECTORY_SEPARATOR . $symbol['file']);
                if ($real === false || !str_ends_with($real, '.php')) {
                    continue;
                }
                $byFile[$real][] = $symbol;
            }
            foreach ($byFile as $real => $planned) {
                $content = @file_get_contents($real);
                if ($content === false || hash('sha256', $content) !== $planned[0]['sha256']) {
                    continue;
                }
                $result = self::instrument($content, $planned);
                if ($result['ids'] === []) {
                    continue;
                }
                $this->served[$real] = $result['code'];
                $this->hashes[$real] = $planned[0]['sha256'];
                array_push($this->instrumented, ...$result['ids']);
            }
            sort($this->instrumented);
        }

        /**
         * `code` with a span around the body of each planned function: after
         * its `{` and before its `}`, on those lines. A function without a
         * body (abstract, in an interface) and a generator get none.
         *
         * @param list<array{id: string, name: string, line: int}> $planned
         * @return array{code: string, ids: list<string>}
         */
        public static function instrument(string $code, array $planned): array
        {
            $tokens = token_get_all($code);
            $count = count($tokens);
            $text = static fn (int $i): string => is_array($tokens[$i]) ? $tokens[$i][1] : $tokens[$i];
            $kind = static fn (int $i): int|string => is_array($tokens[$i]) ? $tokens[$i][0] : $tokens[$i];
            $next = static function (int $i) use ($tokens, $count): int {
                for ($i++; $i < $count; $i++) {
                    if (!is_array($tokens[$i]) || !in_array($tokens[$i][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                        return $i;
                    }
                }
                return $count;
            };
            /** The index of the bracket that closes the one at `$open`. */
            $closing = static function (int $open, string $left, string $right) use ($tokens, $count, $text): int {
                $depth = 0;
                for ($i = $open; $i < $count; $i++) {
                    $t = $text($i);
                    if ($t === $left || ($left === '{' && is_array($tokens[$i]) && in_array($tokens[$i][0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) {
                        $depth++;
                    } elseif ($t === $right) {
                        $depth--;
                        if ($depth === 0) {
                            return $i;
                        }
                    }
                }
                return -1;
            };
            // Each named function: its name, the line of its `function`, and the brackets of its body.
            $functions = [];
            for ($i = 0; $i < $count; $i++) {
                if ($kind($i) !== T_FUNCTION) {
                    continue;
                }
                $at = $next($i);
                if ($at < $count && $text($at) === '&') {
                    $at = $next($at);
                }
                if ($at >= $count || !is_array($tokens[$at]) || $tokens[$at][0] !== T_STRING) {
                    continue; // a closure
                }
                $name = $tokens[$at][1];
                $paren = $next($at);
                if ($paren >= $count || $text($paren) !== '(') {
                    continue;
                }
                $close = $closing($paren, '(', ')');
                if ($close < 0) {
                    continue;
                }
                $body = $close + 1;
                while ($body < $count && $text($body) !== '{' && $text($body) !== ';') {
                    $body++;
                }
                if ($body >= $count || $text($body) !== '{') {
                    continue; // abstract or in an interface: no body
                }
                $end = $closing($body, '{', '}');
                if ($end < 0) {
                    continue;
                }
                $functions[] = ['name' => $name, 'line' => (int) $tokens[$i][2], 'open' => $body, 'close' => $end, 'generator' => self::yields($tokens, $body, $end)];
            }
            $before = [];
            $after = [];
            $ids = [];
            foreach ($planned as $symbol) {
                // The first function of that name at or below the plan's line: the declaration starts there (its attributes, modifiers, `function`).
                $found = null;
                foreach ($functions as $function) {
                    if ($function['name'] === $symbol['name'] && $function['line'] >= $symbol['line'] && ($found === null || $function['line'] < $found['line'])) {
                        $found = $function;
                    }
                }
                if ($found === null || $found['generator']) {
                    continue;
                }
                $id = var_export($symbol['id'], true);
                $after[$found['open']] = " \$__keylangSpan = \\KeylangTrace::start({$id}); try {";
                $before[$found['close']] = ' } catch (\Throwable $__keylangError) { \KeylangTrace::failed($__keylangSpan); throw $__keylangError; } finally { \KeylangTrace::end($__keylangSpan); } ';
                $ids[] = $symbol['id'];
            }
            $out = '';
            for ($i = 0; $i < $count; $i++) {
                $out .= ($before[$i] ?? '') . $text($i) . ($after[$i] ?? '');
            }
            return ['code' => $out, 'ids' => $ids];
        }

        /**
         * A `yield` in the body between the brackets at `$open` and `$close`,
         * not in a function nested in it: the function is a generator. An
         * arrow function (`fn () => …`) has no braces to end a nested scope,
         * so a `yield` in one counts as the body's own: the function is then
         * left uninstrumented, which loses evidence but never interleaves spans.
         *
         * @param list<mixed> $tokens
         */
        private static function yields(array $tokens, int $open, int $close): bool
        {
            $nested = 0;
            $depth = 0;
            $marks = [];
            for ($i = $open + 1; $i < $close; $i++) {
                $token = $tokens[$i];
                $t = is_array($token) ? $token[1] : $token;
                if (is_array($token) && $token[0] === T_FUNCTION) {
                    $marks[] = $depth;
                    $nested++;
                } elseif ($t === '{' || (is_array($token) && in_array($token[0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) {
                    $depth++;
                } elseif ($t === '}') {
                    $depth--;
                    if ($marks !== [] && $depth === end($marks)) {
                        array_pop($marks);
                        $nested--;
                    }
                } elseif ($nested === 0 && is_array($token) && ($token[0] === T_YIELD || $token[0] === T_YIELD_FROM)) {
                    return true;
                }
            }
            return false;
        }

        /** @param array<string, mixed> $event */
        private function event(array $event): void
        {
            if ($this->test === null) {
                return;
            }
            $this->lines[] = json_encode(['schemaVersion' => self::SCHEMA, 'snapshotId' => $this->snapshot, 'runId' => $this->run, 'testId' => $this->test, 'flow' => $this->flow, 'traceId' => "{$this->run}:{$this->test}"] + $event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }

        /**
         * The `run` record of the current test. Under a test runner a test that
         * reached none of the plan's functions ran something else, not the flow:
         * it gets no record. The one test of `KEYLANG_TRACE_TEST` always does.
         */
        private function record(bool $crashed): void
        {
            $reached = $this->reached;
            $this->reached = 0;
            if ($reached === 0 && $this->test !== getenv('KEYLANG_TRACE_TEST')) {
                return;
            }
            $open = array_keys($this->open);
            sort($open);
            $this->event(['event' => 'run', 'complete' => !$crashed && $open === [], 'dropped' => 0, 'instrumented' => $this->instrumented, 'open' => $open]);
            $this->open = [];
            $this->stack = [];
        }

        private static function fail(string $message): never
        {
            fwrite(STDERR, "keylang trace: {$message}\n");
            exit(2);
        }
    }

    /**
     * `file://` while the adapter records: an include of a planned file reads
     * its instrumented source; every other operation is PHP's own, on the
     * native wrapper restored for that call.
     */
    final class KeylangTraceStream
    {
        /** PHP's `STREAM_OPEN_FOR_INCLUDE`: set when `include` or `require` opens the file; userland has no constant for it. */
        private const OPEN_FOR_INCLUDE = 0x80;

        /** @var resource|null */
        public $context;
        /** @var resource|null */
        private $handle;

        public static function register(): void
        {
            stream_wrapper_unregister('file');
            stream_wrapper_register('file', self::class);
        }

        public static function unregister(): void
        {
            @stream_wrapper_restore('file');
        }

        /**
         * `$call` on PHP's own `file://`.
         *
         * @template T
         * @param callable(): T $call
         * @return T
         */
        public static function native(callable $call): mixed
        {
            stream_wrapper_restore('file');
            try {
                return $call();
            } finally {
                stream_wrapper_unregister('file');
                stream_wrapper_register('file', self::class);
            }
        }

        public function stream_open(string $path, string $mode, int $options, ?string &$openedPath): bool
        {
            if (($options & self::OPEN_FOR_INCLUDE) !== 0 && $mode === 'rb') {
                $code = KeylangTrace::served($path);
                if ($code !== null) {
                    $memory = fopen('php://memory', 'w+b');
                    if ($memory === false) {
                        return false;
                    }
                    fwrite($memory, $code);
                    rewind($memory);
                    $this->handle = $memory;
                    $openedPath = $path;
                    return true;
                }
            }
            $usePath = ($options & STREAM_USE_PATH) !== 0;
            $report = ($options & STREAM_REPORT_ERRORS) !== 0;
            $context = $this->context;
            $handle = self::native(static fn () => $report ? fopen($path, $mode, $usePath, $context) : @fopen($path, $mode, $usePath, $context));
            if ($handle === false) {
                return false;
            }
            $this->handle = $handle;
            return true;
        }

        public function stream_read(int $count): string|false
        {
            return fread($this->handle, $count);
        }

        public function stream_write(string $data): int
        {
            return (int) fwrite($this->handle, $data);
        }

        public function stream_eof(): bool
        {
            return feof($this->handle);
        }

        public function stream_tell(): int
        {
            return (int) ftell($this->handle);
        }

        public function stream_seek(int $offset, int $whence = SEEK_SET): bool
        {
            return fseek($this->handle, $offset, $whence) === 0;
        }

        public function stream_flush(): bool
        {
            return fflush($this->handle);
        }

        public function stream_close(): void
        {
            if (is_resource($this->handle)) {
                fclose($this->handle);
            }
            $this->handle = null;
        }

        /** @return array<int|string, int>|false */
        public function stream_stat(): array|false
        {
            return fstat($this->handle);
        }

        public function stream_lock(int $operation): bool
        {
            // PHP asks with 0 whether the stream can lock at all.
            return $operation === 0 ? true : flock($this->handle, $operation);
        }

        public function stream_truncate(int $size): bool
        {
            return ftruncate($this->handle, $size);
        }

        public function stream_set_option(int $option, int $arg1, ?int $arg2): bool
        {
            return match ($option) {
                STREAM_OPTION_BLOCKING => stream_set_blocking($this->handle, (bool) $arg1),
                STREAM_OPTION_READ_TIMEOUT => stream_set_timeout($this->handle, $arg1, (int) $arg2),
                STREAM_OPTION_WRITE_BUFFER => stream_set_write_buffer($this->handle, (int) $arg2) === 0,
                default => false,
            };
        }

        /** @return resource|false */
        public function stream_cast(int $as)
        {
            return $this->handle ?? false;
        }

        /** @return array<int|string, int>|false */
        public function url_stat(string $path, int $flags): array|false
        {
            $link = ($flags & STREAM_URL_STAT_LINK) !== 0;
            $quiet = ($flags & STREAM_URL_STAT_QUIET) !== 0;
            return self::native(static fn () => $quiet ? @($link ? lstat($path) : stat($path)) : ($link ? lstat($path) : stat($path)));
        }

        public function unlink(string $path): bool
        {
            $context = $this->context;
            return self::native(static fn () => $context !== null ? unlink($path, $context) : unlink($path));
        }

        public function rename(string $from, string $to): bool
        {
            $context = $this->context;
            return self::native(static fn () => $context !== null ? rename($from, $to, $context) : rename($from, $to));
        }

        public function mkdir(string $path, int $mode, int $options): bool
        {
            $context = $this->context;
            $recursive = ($options & STREAM_MKDIR_RECURSIVE) !== 0;
            return self::native(static fn () => $context !== null ? mkdir($path, $mode, $recursive, $context) : mkdir($path, $mode, $recursive));
        }

        public function rmdir(string $path, int $options): bool
        {
            $context = $this->context;
            return self::native(static fn () => $context !== null ? rmdir($path, $context) : rmdir($path));
        }

        public function stream_metadata(string $path, int $option, mixed $value): bool
        {
            return self::native(static fn () => match ($option) {
                STREAM_META_TOUCH => is_array($value) && $value !== [] ? touch($path, (int) $value[0], (int) ($value[1] ?? $value[0])) : touch($path),
                STREAM_META_OWNER_NAME, STREAM_META_OWNER => chown($path, $value),
                STREAM_META_GROUP_NAME, STREAM_META_GROUP => chgrp($path, $value),
                STREAM_META_ACCESS => chmod($path, (int) $value),
                default => false,
            });
        }

        public function dir_opendir(string $path, int $options): bool
        {
            $context = $this->context;
            $handle = self::native(static fn () => $context !== null ? opendir($path, $context) : opendir($path));
            if ($handle === false) {
                return false;
            }
            $this->handle = $handle;
            return true;
        }

        public function dir_readdir(): string|false
        {
            return readdir($this->handle);
        }

        public function dir_rewinddir(): bool
        {
            rewinddir($this->handle);
            return true;
        }

        public function dir_closedir(): bool
        {
            closedir($this->handle);
            $this->handle = null;
            return true;
        }
    }
}

KeylangTrace::install();

// Run as a script: `php keylang_trace.php <script> [args...]` runs the script under the adapter.
if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    if (getenv('KEYLANG_TRACE') === false || getenv('KEYLANG_TRACE_PLAN') === false || getenv('KEYLANG_TRACE_TEST') === false) {
        fwrite(STDERR, "keylang trace: KEYLANG_TRACE, KEYLANG_TRACE_PLAN and KEYLANG_TRACE_TEST are required\n");
        exit(2);
    }
    if (count($argv) < 2) {
        fwrite(STDERR, "keylang trace: usage: php keylang_trace.php <script> [args...]\n");
        exit(2);
    }
    $argv = array_slice($argv, 1);
    $argc = count($argv);
    $_SERVER['argv'] = $argv;
    $_SERVER['argc'] = $argc;
    require $argv[0];
}
