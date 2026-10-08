<?php
namespace Shop\Checkout\Api;

interface TotalsInterface
{
    public function collect(array $order): array;
}
