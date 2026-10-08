<?php
namespace Shop\Checkout\Model;

use Magento\Framework\Event\ManagerInterface;
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
        $logger,
        private ManagerInterface $eventManager
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
        $this->eventManager->dispatch('checkout_submit_before', ['order' => $order]);
        $order = $this->totals->collect($order);
        $this->logger->log('submit');
        $this->notifier->notify($order);
        $this->clock->now();
        $placed = $this->orderManagement->place($order);
        $this->eventManager->dispatch('checkout_submit_all_after', ['order' => $placed]);
        $this->eventManager->dispatch('checkout_' . $order['type'] . '_placed', ['order' => $placed]);
        return $placed;
    }
}
