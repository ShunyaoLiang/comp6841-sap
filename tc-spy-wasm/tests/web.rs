extern crate tc_spy_wasm;
use tc_spy_wasm::terminates;
use wasm_bindgen_test::wasm_bindgen_test;

wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn run_terminates() {
    terminates();
}
