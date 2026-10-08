<?php
namespace Shop\Checkout\Model;

use Shop\Checkout\Api\ClockInterface;
use Shop\Checkout\Api\NotifierInterface;
use Shop\Checkout\Api\TotalsInterface;
use Shop\Sales\Api\OrderManagementInterface;

class QuoteManagement
{
    /** @var OrderManagementInterface */
    private $orderManagement;

    private $logger;

    public function __construct(
        OrderManagementInterface $orderManagement,
        private TotalsInterface $totals,
        private NotifierInterface $notifier,
        private ClockInterface $clock,
        $logger
    ) {
        $this->orderManagement = $orderManagement;
        $this->logger = $logger;
    }

    public function placeOrder(array $order): array
    {
        return $this->submit($order);
    }

    public function submit(array $order): array
    {
        $order = $this->totals->collect($order);
        $this->logger->log('submit');
        $this->notifier->notify($order);
        $this->clock->now();
        return $this->orderManagement->place($order);
    }
}
