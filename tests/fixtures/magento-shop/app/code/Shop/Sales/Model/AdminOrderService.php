<?php
namespace Shop\Sales\Model;

class AdminOrderService extends OrderService
{
    public function place(array $order): array
    {
        return $this->save($order);
    }
}
