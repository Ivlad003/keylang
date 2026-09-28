use crate::infra::db::Db;

pub struct Order {
    pub total: u32,
}

impl Order {
    pub fn new() -> Self {
        Order { total: 0 }
    }

    pub fn total(&self) -> u32 {
        self.total
    }
}

pub fn place() -> Db {
    let order = Order::new();
    order.total();
    helper();
    let _ = Some(u64::from(order.total));
    Db
}

fn helper() {}

#[cfg(test)]
mod tests {
    use super::*;
}
