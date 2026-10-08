<?php
namespace Shop\Sales\Model;

use Shop\Sales\Api\OrderManagementInterface;

class OrderService implements OrderManagementInterface
{
    public function place(array $order): array
    {
        return $this->save($order);
    }

    public function save(array $order): array
    {
        return $order;
    }
}
