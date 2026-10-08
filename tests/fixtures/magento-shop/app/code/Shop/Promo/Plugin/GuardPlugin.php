<?php
namespace Shop\Promo\Plugin;

class GuardPlugin
{
    public function beforePlace($subject, array $order): array
    {
        return [$order];
    }
}
