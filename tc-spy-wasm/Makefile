# From rust-lang/rust issue #128475.
# https://github.com/rust-lang/rust/issues/128475
RUSTFLAGS+=-C target-cpu=mvp
CARGOFLAGS+=-Z build-std=std,panic_abort

# From rust-lang/rust issue #109807
# https://github.com/rust-lang/rust/issues/109807
RUSTFLAGS+=-C target-feature=-sign-ext

.PHONY: build
build:
	RUSTFLAGS="$(RUSTFLAGS)" wasm-pack build --debug --target no-modules \
		. $(CARGOFLAGS)
	wasm-validate \
		--disable-reference-types \
		--disable-sign-extension \
		pkg/tc_spy_wasm_bg.wasm
	wasm2wat pkg/tc_spy_wasm_bg.wasm > pkg/tc_spy_wasm_bg.wat

.PHONY: clean
clean:
	rm -rf pkg/
	cargo clean
