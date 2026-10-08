<?php
namespace Shop\Checkout\Model;

use Shop\Checkout\Api\NotifierInterface;

class EmailNotifier implements NotifierInterface
{
    public function notify(array $order): void
    {
    }
}
