from ..infra.db import Db


class Order:
    def __init__(self):
        self.amount = 0

    def total(self):
        return self.amount

    def paid(self):
        return self.total() > 0

    def notify(self, queue):
        self.queue = queue
        self.queue.put(self.amount)


def place():
    order = Order()
    order.total()
    _helper()
    return Db()


def _helper():
    pass
