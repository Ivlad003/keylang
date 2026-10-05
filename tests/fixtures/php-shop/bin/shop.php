<?php

require __DIR__ . '/../vendor/autoload.php';

use Monolog\Logger;
use Shop\App\Checkout;
use Shop\Infra\Store;

$checkout = new Checkout(new Store(new Logger('shop')));
echo $checkout->buy([100, 250]), "\n";
