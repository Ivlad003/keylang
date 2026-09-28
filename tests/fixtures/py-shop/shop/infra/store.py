import json

from shop.domain import order
from shop.domain.order import place


def save():
    place()
    order.place()
    return json.dumps({})
