<?php

declare(strict_types=1);

namespace Shop\Infra;

use Monolog\Logger;
use Shop\Domain\Order;

/** Keeps orders. */
class Store
{
    public function __construct(private Logger $log)
    {
    }

    public function save(Order $order): void
    {
        $this->log->info('saved');
        $order->total();
    }
}
