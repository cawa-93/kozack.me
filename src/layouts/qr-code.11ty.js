const QRCode = require('qrcode');
const oxipng = require('@wasm-codecs/oxipng');

module.exports = class {
	data() {
		return {
			permalink: data => `${data.page.filePathStem}.png`,
		};
	}


	render(data) {
		const text = (new (require('./vcard.11ty.js'))).render(data);

		return QRCode
			.toBuffer(text.trim(), {errorCorrectionLevel: 'L'})
			.then(buffer => oxipng(buffer, {level: 3}));
	}
};
