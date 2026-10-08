<?php
namespace Shop\Checkout\Api;

interface NotifierInterface
{
    public function notify(array $order): void;
}
