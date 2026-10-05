<?php

declare(strict_types=1);

namespace Shop\Domain;

/** An order of a cart: its lines and their total. */
final class Order
{
    /** @var list<int> */
    private array $prices = [];

    public function __construct(private Pricing $pricing)
    {
    }

    /**
     * Adds a line.
     *
     * @param int $price in cents
     */
    public function add(int $price): void
    {
        $this->prices[] = $price;
    }

    public function total(): int
    {
        return $this->pricing->sum($this->prices);
    }
}
