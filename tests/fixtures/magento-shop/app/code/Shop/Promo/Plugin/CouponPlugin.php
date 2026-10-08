<?php
namespace Shop\Promo\Plugin;

use Shop\Checkout\Model\QuoteManagement;

class CouponPlugin
{
    public function aroundSubmit(QuoteManagement $subject, \Closure $proceed, array $order): array
    {
        return $proceed($order);
    }
}
