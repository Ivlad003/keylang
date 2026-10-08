<?php
namespace Shop\Sales\Model;

use Shop\Checkout\Api\TotalsInterface;

class Totals implements TotalsInterface
{
    public function collect(array $order): array
    {
        return $order;
    }
}
