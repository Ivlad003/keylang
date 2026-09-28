mod domain;
mod infra;

use crate::infra::store::save;

fn main() {
    save();
    domain::order::place();
    println!("done");
}
