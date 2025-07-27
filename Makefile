.PHONY: build
build:
	make -C tc-spy-wasm build
	npm --prefix www install
	npm --prefix www run build

.PHONY: clean
clean:
	make -C tc-spy-wasm clean
	rm -rf www/node_modules www/script.js

.PHONY: deploy
deploy: build
	rsync --recursive --times --compress --delete --copy-links --progress \
		www/ cse:~/public_html/comp6841-sap/
