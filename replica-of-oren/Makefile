deploy: index.html script.js
	rsync --recursive --times --compress --delete --copy-links --progress \
		--perms --chmod=D755,F644 \
		index.html script.js cse:~/public_html/comp6841-sap/replica-of-oren/
	touch deploy

script.js: script.ts
	npm run build
