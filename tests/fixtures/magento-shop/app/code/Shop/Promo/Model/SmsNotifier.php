<?php
namespace Shop\Promo\Model;

use Shop\Checkout\Api\NotifierInterface;

class SmsNotifier implements NotifierInterface
{
    public function notify(array $order): void
    {
    }
}
