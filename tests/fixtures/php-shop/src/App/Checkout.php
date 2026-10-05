<?php

declare(strict_types=1);

namespace Shop\App;

use Shop\Domain\{Order, Pricing};
use Shop\Infra\Store;

use function Shop\Support\money;

class Checkout
{
    public function __construct(private Store $store)
    {
    }

    /** @param list<int> $prices */
    public function buy(array $prices): string
    {
        $order = new Order(new Pricing());
        foreach ($prices as $price) {
            $order->add($price);
        }
        $this->store->save($order);
        Pricing::round(1.5);
        $handler = $this->pick();
        $handler();
        return money($order->total());
    }

    private function pick(): callable
    {
        return fn () => null;
    }
}
