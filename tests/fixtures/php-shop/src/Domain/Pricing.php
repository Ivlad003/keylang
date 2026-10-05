<?php

declare(strict_types=1);

namespace Shop\Domain;

class Pricing
{
    /** @param list<int> $prices */
    public function sum(array $prices): int
    {
        return array_sum($prices);
    }

    public static function round(float $value): int
    {
        return (int) round($value);
    }
}
