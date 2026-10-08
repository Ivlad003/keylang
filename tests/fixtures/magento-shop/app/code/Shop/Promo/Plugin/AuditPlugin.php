<?php
namespace Shop\Promo\Plugin;

class AuditPlugin
{
    public function beforeSubmit($subject, array $order): array
    {
        return [$order];
    }

    public function afterSubmit($subject, array $result): array
    {
        return $result;
    }
}
