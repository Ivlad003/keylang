<?php
namespace Shop\Checkout\Api;

interface ClockInterface
{
    public function now(): int;
}
