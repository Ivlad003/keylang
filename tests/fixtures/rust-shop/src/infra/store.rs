use serde::Serialize;

pub fn save() {
    crate::domain::order::place();
    audit!("saved");
}
