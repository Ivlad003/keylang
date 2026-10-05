<?php

declare(strict_types=1);

namespace Shop\Support;

/** Cents as a decimal string. */
function money(int $cents): string
{
    return sprintf('%d.%02d', intdiv($cents, 100), $cents % 100);
}
