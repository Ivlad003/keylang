<?php
namespace Shop\Sales\Api;

interface OrderManagementInterface
{
    public function place(array $order): array;
}
