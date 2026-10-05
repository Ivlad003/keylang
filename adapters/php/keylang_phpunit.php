<?php

/**
 * keylang's PHPUnit extension (PHPUnit 10 or newer): a keylang test report
 * (schema 1) and, with the trace adapter, one trace run per test.
 *
 *     <!-- phpunit.xml -->
 *     <extensions>
 *         <bootstrap class="Keylang\PHPUnit\Extension"/>
 *     </extensions>
 *
 * The class is loaded from this file: require it in PHPUnit's bootstrap (or
 * list it in composer's `autoload-dev.files`).
 *
 * The report goes to `KEYLANG_TEST_REPORT`, else `.keylang/reports/phpunit.json`
 * under `KEYLANG_TRACE_ROOT` (default: cwd). Each test is a row: its file
 * relative to that root, its class's short name as the suite, its method as
 * the name, and `pass`, `fail` (failed or errored, in any data set) or `skip`
 * (skipped or incomplete). The report is bound to `KEYLANG_SNAPSHOT_ID`, else
 * to the snapshot of the trace plan (`KEYLANG_TRACE_PLAN`), else to the one
 * `keylang map` last wrote to `.keylang/index.json`: run `keylang map` after
 * the last change and before the tests, or the report is stale. When the
 * trace adapter records (`php -d auto_prepend_file=keylang_trace.php`), each
 * test is a trace run of its own, named `<file> > <Class> > <method>`.
 */

declare(strict_types=1);

namespace Keylang\PHPUnit;

use PHPUnit\Event\Code\TestMethod;
use PHPUnit\Event\Test\Errored;
use PHPUnit\Event\Test\ErroredSubscriber;
use PHPUnit\Event\Test\Failed;
use PHPUnit\Event\Test\FailedSubscriber;
use PHPUnit\Event\Test\Finished;
use PHPUnit\Event\Test\FinishedSubscriber;
use PHPUnit\Event\Test\MarkedIncomplete;
use PHPUnit\Event\Test\MarkedIncompleteSubscriber;
use PHPUnit\Event\Test\Passed;
use PHPUnit\Event\Test\PassedSubscriber;
use PHPUnit\Event\Test\Prepared;
use PHPUnit\Event\Test\PreparedSubscriber;
use PHPUnit\Event\Test\Skipped;
use PHPUnit\Event\Test\SkippedSubscriber;
use PHPUnit\Event\TestRunner\ExecutionFinished;
use PHPUnit\Event\TestRunner\ExecutionFinishedSubscriber;
use PHPUnit\Runner\Extension\Extension as PhpunitExtension;
use PHPUnit\Runner\Extension\Facade;
use PHPUnit\Runner\Extension\ParameterCollection;
use PHPUnit\TextUI\Configuration\Configuration;

/** The rows of the report, and the test the trace adapter records now. */
final class Report
{
    /** @var array<string, array{file: string, suite: string, name: string, status: string}> */
    private array $rows = [];
    private readonly string $root;

    public function __construct()
    {
        $root = getenv('KEYLANG_TRACE_ROOT');
        $this->root = rtrim(realpath($root !== false && $root !== '' ? $root : (string) getcwd()) ?: (string) getcwd(), '/\\');
    }

    /** A test result; a failure wins over a pass, a pass over a skip, across data sets. */
    public function status(TestMethod $test, string $status): void
    {
        $file = $this->relative($test->file());
        $suite = substr(strrchr('\\' . $test->className(), '\\') ?: '', 1);
        $key = "{$file}\0{$suite}\0{$test->methodName()}";
        $rank = ['skip' => 0, 'pass' => 1, 'fail' => 2];
        $previous = $this->rows[$key]['status'] ?? null;
        if ($previous === null || $rank[$status] > $rank[$previous]) {
            $this->rows[$key] = ['file' => $file, 'suite' => $suite, 'name' => $test->methodName(), 'status' => $status];
        }
    }

    public function started(TestMethod $test): void
    {
        if (class_exists('KeylangTrace', false)) {
            $file = $this->relative($test->file());
            $class = substr(strrchr('\\' . $test->className(), '\\') ?: '', 1);
            \KeylangTrace::test("{$file} > {$class} > {$test->methodName()}");
        }
    }

    public function ended(): void
    {
        if (class_exists('KeylangTrace', false)) {
            \KeylangTrace::testEnd();
        }
    }

    /** The report, sorted by file, suite and name. */
    public function write(): void
    {
        $path = getenv('KEYLANG_TEST_REPORT');
        $path = $path !== false && $path !== '' ? $path : $this->root . '/.keylang/reports/phpunit.json';
        $rows = array_values($this->rows);
        usort($rows, static fn (array $a, array $b): int => [$a['file'], $a['suite'], $a['name']] <=> [$b['file'], $b['suite'], $b['name']]);
        $run = getenv('KEYLANG_TRACE_RUN');
        $runId = $run !== false && $run !== '' ? $run : (class_exists('KeylangTrace', false) ? \KeylangTrace::runId() : null);
        $report = ['schemaVersion' => 1, 'snapshotId' => $this->snapshotId(), 'runId' => $runId ?? dechex((int) (microtime(true) * 1000)) . '-' . getmypid(), 'tests' => $rows];
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        file_put_contents($path, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n");
    }

    /** `KEYLANG_SNAPSHOT_ID`, the trace plan's snapshot, or the one `.keylang/index.json` holds; null without any. */
    private function snapshotId(): ?string
    {
        $id = getenv('KEYLANG_SNAPSHOT_ID');
        if ($id !== false && $id !== '') {
            return $id;
        }
        $plan = getenv('KEYLANG_TRACE_PLAN');
        foreach ([$plan !== false && $plan !== '' ? $plan : null, $this->root . '/.keylang/index.json'] as $file) {
            if ($file === null || !is_file($file)) {
                continue;
            }
            $data = json_decode((string) file_get_contents($file), true);
            if (is_array($data) && is_string($data['snapshotId'] ?? null)) {
                return $data['snapshotId'];
            }
        }
        return null;
    }

    /** A path relative to the root, with `/`; one outside it stays absolute. */
    private function relative(string $file): string
    {
        $real = realpath($file) ?: $file;
        $real = str_replace('\\', '/', $real);
        $root = str_replace('\\', '/', $this->root);
        return str_starts_with($real, $root . '/') ? substr($real, strlen($root) + 1) : $real;
    }
}

final class Extension implements PhpunitExtension
{
    public function bootstrap(Configuration $configuration, Facade $facade, ParameterCollection $parameters): void
    {
        $report = new Report();
        $facade->registerSubscribers(
            new class ($report) implements PreparedSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(Prepared $event): void
                {
                    $test = $event->test();
                    if ($test instanceof TestMethod) {
                        $this->report->started($test);
                    }
                }
            },
            new class ($report) implements PassedSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(Passed $event): void
                {
                    $test = $event->test();
                    if ($test instanceof TestMethod) {
                        $this->report->status($test, 'pass');
                    }
                }
            },
            new class ($report) implements FailedSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(Failed $event): void
                {
                    $test = $event->test();
                    if ($test instanceof TestMethod) {
                        $this->report->status($test, 'fail');
                    }
                }
            },
            new class ($report) implements ErroredSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(Errored $event): void
                {
                    $test = $event->test();
                    if ($test instanceof TestMethod) {
                        $this->report->status($test, 'fail');
                    }
                }
            },
            new class ($report) implements SkippedSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(Skipped $event): void
                {
                    $test = $event->test();
                    if ($test instanceof TestMethod) {
                        $this->report->status($test, 'skip');
                    }
                }
            },
            new class ($report) implements MarkedIncompleteSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(MarkedIncomplete $event): void
                {
                    $test = $event->test();
                    if ($test instanceof TestMethod) {
                        $this->report->status($test, 'skip');
                    }
                }
            },
            new class ($report) implements FinishedSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(Finished $event): void
                {
                    $this->report->ended();
                }
            },
            new class ($report) implements ExecutionFinishedSubscriber {
                public function __construct(private readonly Report $report)
                {
                }

                public function notify(ExecutionFinished $event): void
                {
                    $this->report->write();
                }
            },
        );
    }
}
