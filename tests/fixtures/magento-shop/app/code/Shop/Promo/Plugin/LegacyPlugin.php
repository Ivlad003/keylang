<?php
namespace Shop\Promo\Plugin;

class LegacyPlugin
{
    public function beforeSubmit($subject, array $order): array
    {
        return [$order];
    }
}
